import * as Y from 'yjs';
import { ensureDefaultPage } from '@draftila/engine';
import { COLLABORATION_ACCESS_CHANGED, COLLABORATION_ACCESS_MESSAGE } from '@draftila/shared';
import { getDraftAccess } from '../drafts/drafts.access';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as draftsService from '../drafts/drafts.service';
import * as snapshotsService from '../snapshots/snapshots.service';
import { increment, recordDuration, recordValue } from '../../common/lib/metrics';
import {
  sendRpc as sendRpcInternal,
  handleRpcResponse,
  getRpcInterceptor,
  rejectAllPending,
} from './collaboration.rpc';

export { setRpcInterceptor } from './collaboration.rpc';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_RPC = 2;

const SNAPSHOT_INTERVAL_MS = 30_000;
const COMPACTION_BYTES = 1_000_000;

export interface WsData {
  draftId: string;
  userId: string;
  projectId: string;
}

interface WsLike {
  send(data: Uint8Array | ArrayBuffer | string): void;
  close?(code?: number, reason?: string): void;
}

interface Room {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WsLike>;
  snapshotTimer: ReturnType<typeof setInterval> | null;
  dirty: boolean;
  updateHandler: ((update: Uint8Array, origin: unknown) => void) | null;
  pendingUpdates: Uint8Array[];
  loggedBytes: number;
  maxUpdateId: number;
  activeOperations: number;
  closing: Promise<void> | null;
  retainUntil: number;
  autoSaveUserId: string | null;
}

const rooms = new Map<string, Room>();
const loadingRooms = new Map<string, Promise<Room>>();
interface Connection extends WsData {
  canEdit: boolean;
  revoked: boolean;
  ready: Promise<void>;
}

const connectionData = new Map<WsLike, Connection>();

function getRoomConnections(draftId: string): Set<WsLike> | undefined {
  const connections = rooms.get(draftId)?.connections;
  if (!connections) return undefined;
  return new Set([...connections].filter((ws) => connectionData.get(ws)?.canEdit));
}

export async function getOrCreateRoom(draftId: string): Promise<Room> {
  const existing = rooms.get(draftId);
  if (existing) return existing;

  const pending = loadingRooms.get(draftId);
  if (pending) return pending;
  const loading = loadRoom(draftId);
  loadingRooms.set(draftId, loading);
  try {
    return await loading;
  } finally {
    loadingRooms.delete(draftId);
  }
}

async function loadRoom(draftId: string): Promise<Room> {
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);

  const loadStart = performance.now();
  const savedState = await draftsService.loadYjsState(draftId);
  recordDuration('collab.load_state', performance.now() - loadStart);

  if (savedState) {
    recordValue('collab.loaded_bytes', savedState.byteLength);
    const applyStart = performance.now();
    Y.applyUpdate(ydoc, new Uint8Array(savedState));
    recordDuration('collab.apply_state', performance.now() - applyStart);
  }

  const logged = await draftsService.loadYjsUpdates(draftId);
  if (logged.length > 0) {
    const replayStart = performance.now();
    for (const entry of logged) {
      Y.applyUpdate(ydoc, new Uint8Array(entry.payload));
    }
    recordDuration('collab.apply_updates', performance.now() - replayStart);
  }
  increment('collab.room_created');

  const room: Room = {
    ydoc,
    awareness,
    connections: new Set(),
    snapshotTimer: null,
    dirty: false,
    updateHandler: null,
    pendingUpdates: [],
    loggedBytes: 0,
    maxUpdateId: 0,
    activeOperations: 0,
    closing: null,
    retainUntil: 0,
    autoSaveUserId: null,
  };

  const updateHandler = (update: Uint8Array, origin: unknown) => {
    room.dirty = true;
    room.pendingUpdates.push(update);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const encoded = encoding.toUint8Array(encoder);

    const originWs = origin instanceof Object && 'send' in origin ? (origin as WsLike) : null;
    broadcastToRoom(room, encoded, originWs);
  };

  ydoc.on('update', updateHandler);
  room.updateHandler = updateHandler;

  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      _origin: unknown,
    ) => {
      const changedClients = [...added, ...updated, ...removed];
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const message = encoding.toUint8Array(encoder);
      broadcastToRoom(room, message, null);
    },
  );

  room.snapshotTimer = setInterval(() => {
    void flushRoom(draftId, room);
  }, SNAPSHOT_INTERVAL_MS);

  rooms.set(draftId, room);
  return room;
}

export function handleConnection(ws: WsLike, draftId: string, wsData: WsData): Promise<void> {
  const connection: Connection = {
    ...wsData,
    canEdit: false,
    revoked: false,
    ready: Promise.resolve(),
  };
  connectionData.set(ws, connection);
  connection.ready = initializeConnection(ws, draftId, connection).catch((error: unknown) => {
    connection.revoked = true;
    ws.close?.(1011, 'Unable to authorize connection');
    console.error('Unable to authorize collaboration connection:', error);
  });
  return connection.ready;
}

async function initializeConnection(ws: WsLike, draftId: string, connection: Connection) {
  const access = await getDraftAccess(draftId, connection.userId);
  if (connectionData.get(ws) !== connection || connection.revoked) return;
  if (!access || connection.draftId !== draftId || access.projectId !== connection.projectId) {
    connection.revoked = true;
    ws.close?.(COLLABORATION_ACCESS_CHANGED, 'Draft access denied');
    return;
  }
  const room = await acquireRoom(draftId);
  try {
    if (connectionData.get(ws) !== connection || connection.revoked) return;
    ensureDefaultPage(room.ydoc);
    connection.canEdit = access.canEdit;
    room.connections.add(ws);
    sendConnectionAccess(ws, access.canEdit);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.ydoc);
    ws.send(encoding.toUint8Array(encoder));

    const awarenessStates = room.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(awarenessStates.keys())),
      );
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }
  } finally {
    await releaseRoom(draftId, room);
  }
}

function sendConnectionAccess(ws: WsLike, canEdit: boolean) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, COLLABORATION_ACCESS_MESSAGE);
  encoding.writeVarString(encoder, JSON.stringify({ canEdit }));
  ws.send(encoding.toUint8Array(encoder));
}

export function revokeProjectConnections(projectId: string, userId: string) {
  for (const [ws, connection] of connectionData) {
    if (connection.projectId !== projectId || connection.userId !== userId) continue;
    connection.canEdit = false;
    connection.revoked = true;
    rooms.get(connection.draftId)?.connections.delete(ws);
    sendConnectionAccess(ws, false);
    ws.close?.(COLLABORATION_ACCESS_CHANGED, 'Draft access changed');
  }
}

export async function handleMessage(ws: WsLike, draftId: string, message: ArrayBuffer | Buffer) {
  const connection = connectionData.get(ws);
  if (!connection) return;
  await connection.ready;
  if (connectionData.get(ws) !== connection || connection.revoked || connection.draftId !== draftId)
    return;
  const room = rooms.get(draftId);
  if (!room) return;

  const data = new Uint8Array(message);
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MESSAGE_SYNC: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      const syncType = decoding.readVarUint(decoder);
      if (syncType === syncProtocol.messageYjsSyncStep1) {
        syncProtocol.readSyncStep1(decoder, encoder, room.ydoc);
      } else if (connection.canEdit && syncType === syncProtocol.messageYjsSyncStep2) {
        syncProtocol.readSyncStep2(decoder, room.ydoc, ws);
      } else if (connection.canEdit && syncType === syncProtocol.messageYjsUpdate) {
        syncProtocol.readUpdate(decoder, room.ydoc, ws);
      }
      if (encoding.length(encoder) > 1) {
        ws.send(encoding.toUint8Array(encoder));
      }
      break;
    }
    case MESSAGE_AWARENESS: {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        ws,
      );
      break;
    }
    case MESSAGE_RPC: {
      const payload = decoding.readVarString(decoder);
      if (connection.canEdit) handleRpcResponse(payload);
      break;
    }
  }
}

export async function handleDisconnect(ws: WsLike, draftId: string) {
  const wsData = connectionData.get(ws);
  connectionData.delete(ws);
  const room = rooms.get(draftId);
  if (!room) return;
  room.connections.delete(ws);

  if (room.connections.size === 0 && wsData) room.autoSaveUserId = wsData.userId;
  await closeIdleRoom(draftId, room);
}

async function acquireRoom(draftId: string): Promise<Room> {
  while (true) {
    const room = await getOrCreateRoom(draftId);
    if (rooms.get(draftId) !== room) continue;
    room.activeOperations += 1;
    return room;
  }
}

async function releaseRoom(draftId: string, room: Room) {
  room.activeOperations -= 1;
  if (rooms.get(draftId) === room) await closeIdleRoom(draftId, room);
}

export async function withRoom<T>(
  draftId: string,
  operation: (ydoc: Y.Doc) => Promise<T> | T,
  options: { retainForMs?: number } = {},
): Promise<T> {
  const room = await acquireRoom(draftId);
  room.retainUntil = Math.max(room.retainUntil, Date.now() + (options.retainForMs ?? 0));
  try {
    return await operation(room.ydoc);
  } finally {
    await releaseRoom(draftId, room);
  }
}

async function flushRoom(draftId: string, room: Room): Promise<void> {
  if (room.pendingUpdates.length === 0) {
    if (room.loggedBytes > COMPACTION_BYTES) await compactRoom(draftId, room);
    return;
  }

  const batch = room.pendingUpdates;
  room.pendingUpdates = [];

  try {
    const merged = Buffer.from(Y.mergeUpdates(batch));
    const updateId = await draftsService.appendYjsUpdate(draftId, merged);
    room.maxUpdateId = Math.max(room.maxUpdateId, updateId);
    room.loggedBytes += merged.byteLength;
    increment('collab.autosave');
  } catch (err) {
    room.pendingUpdates = [...batch, ...room.pendingUpdates];
    console.error(`Failed to append update for draft ${draftId}:`, err);
    return;
  }

  if (room.loggedBytes > COMPACTION_BYTES) await compactRoom(draftId, room);
}

async function compactRoom(draftId: string, room: Room): Promise<void> {
  try {
    const encodeStart = performance.now();
    const state = Buffer.from(Y.encodeStateAsUpdate(room.ydoc));
    recordDuration('collab.encode_state', performance.now() - encodeStart);
    recordValue('collab.state_bytes', state.byteLength);
    recordValue('collab.shape_count', countShapes(room.ydoc));

    const writeStart = performance.now();
    await draftsService.compactYjsState(draftId, state, room.maxUpdateId);
    recordDuration('collab.save_state', performance.now() - writeStart);
    room.loggedBytes = 0;
    room.maxUpdateId = 0;
    room.dirty = false;
  } catch (err) {
    console.error(`Failed to compact draft ${draftId}:`, err);
  }
}

function countShapes(ydoc: Y.Doc): number {
  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  let total = 0;
  for (const page of pages.values()) {
    const shapes = page.get('shapes');
    if (shapes instanceof Y.Map) total += shapes.size;
  }
  if (total === 0) {
    const legacy = ydoc.getMap('shapes');
    total = legacy.size;
  }
  return total;
}

function broadcastToRoom(room: Room, message: Uint8Array, exclude: WsLike | null) {
  for (const conn of room.connections) {
    if (conn !== exclude) {
      conn.send(message);
    }
  }
}

export function getRoomCount(): number {
  return rooms.size;
}

export function getConnectionCount(draftId: string): number {
  return rooms.get(draftId)?.connections.size ?? 0;
}

export function getRoomYDoc(draftId: string): Y.Doc | null {
  return rooms.get(draftId)?.ydoc ?? null;
}

export function applyUpdateToRoom(draftId: string, update: Uint8Array): boolean {
  const room = rooms.get(draftId);
  if (!room) return false;
  Y.applyUpdate(room.ydoc, update);
  return true;
}

export function hasActiveConnection(draftId: string): boolean {
  if (getRpcInterceptor()) return true;
  const room = rooms.get(draftId);
  return !!room && room.connections.size > 0;
}

export function sendRpc(
  draftId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return sendRpcInternal(draftId, tool, args, getRoomConnections);
}

export function destroyRoom(draftId: string) {
  const room = rooms.get(draftId);
  if (!room) return;

  if (room.snapshotTimer) clearInterval(room.snapshotTimer);
  if (room.updateHandler) room.ydoc.off('update', room.updateHandler);

  for (const conn of room.connections) {
    connectionData.delete(conn);
    conn.close?.();
  }

  room.awareness.destroy();
  room.ydoc.destroy();
  rooms.delete(draftId);
}

async function closeIdleRoom(draftId: string, room: Room) {
  if (room.connections.size > 0 || room.activeOperations > 0) return;
  if (room.retainUntil > Date.now() && !room.autoSaveUserId) return;
  if (room.closing) {
    await room.closing;
    if (rooms.get(draftId) === room) await closeIdleRoom(draftId, room);
    return;
  }
  room.closing = persistAndCloseIdleRoom(draftId, room);
  try {
    await room.closing;
  } finally {
    room.closing = null;
  }
}

async function persistAndCloseIdleRoom(draftId: string, room: Room) {
  const autoSaveUserId = room.autoSaveUserId;
  room.autoSaveUserId = null;
  const hadUnsavedEdits = room.dirty;
  await flushRoom(draftId, room);
  if (room.loggedBytes > 0 || room.pendingUpdates.length > 0) await compactRoom(draftId, room);
  if (autoSaveUserId && hadUnsavedEdits) {
    try {
      await snapshotsService.createAutoSave(
        draftId,
        autoSaveUserId,
        Buffer.from(Y.encodeStateAsUpdate(room.ydoc)),
      );
    } catch (error) {
      room.autoSaveUserId ??= autoSaveUserId;
      throw error;
    }
  }
  if (room.connections.size > 0 || room.activeOperations > 0 || rooms.get(draftId) !== room) return;
  if (
    room.pendingUpdates.length > 0 ||
    room.dirty ||
    room.autoSaveUserId ||
    room.retainUntil > Date.now()
  )
    return;
  if (room.snapshotTimer) clearInterval(room.snapshotTimer);
  if (room.updateHandler) room.ydoc.off('update', room.updateHandler);
  room.awareness.destroy();
  room.ydoc.destroy();
  rooms.delete(draftId);
}

export async function closeRoom(draftId: string) {
  const room = rooms.get(draftId);
  if (room) await closeIdleRoom(draftId, room);
}

export function closeAllRooms() {
  for (const [_draftId, room] of rooms) {
    if (room.snapshotTimer) clearInterval(room.snapshotTimer);

    if (room.updateHandler) room.ydoc.off('update', room.updateHandler);
    room.awareness.destroy();
    room.ydoc.destroy();
  }
  rooms.clear();
  connectionData.clear();

  rejectAllPending();
}
