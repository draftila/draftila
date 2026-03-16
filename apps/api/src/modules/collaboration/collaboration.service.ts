import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as draftsService from '../drafts/drafts.service';
import { nanoid } from '../../common/lib/utils';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_RPC = 2;

const RPC_TIMEOUT_MS = 30_000;

const SNAPSHOT_INTERVAL_MS = 30_000;

export interface WsData {
  draftId: string;
  userId: string;
}

interface WsLike {
  send(data: Uint8Array | ArrayBuffer | string): void;
}

interface Room {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WsLike>;
  snapshotTimer: ReturnType<typeof setInterval> | null;
  dirty: boolean;
  updateHandler: ((update: Uint8Array, origin: unknown) => void) | null;
}

interface PendingRpc {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, Room>();
const pendingRpcs = new Map<string, PendingRpc>();
const connectionData = new Map<WsLike, WsData>();

export async function getOrCreateRoom(draftId: string): Promise<Room> {
  const existing = rooms.get(draftId);
  if (existing) return existing;

  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);

  const savedState = await draftsService.loadYjsState(draftId);
  if (savedState) {
    Y.applyUpdate(ydoc, new Uint8Array(savedState));
  }

  const room: Room = {
    ydoc,
    awareness,
    connections: new Set(),
    snapshotTimer: null,
    dirty: false,
    updateHandler: null,
  };

  const updateHandler = (update: Uint8Array, origin: unknown) => {
    room.dirty = true;
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
      origin: unknown,
    ) => {
      const changedClients = [...added, ...updated, ...removed];
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const message = encoding.toUint8Array(encoder);
      const originWs = origin instanceof Object && 'send' in origin ? (origin as WsLike) : null;
      broadcastToRoom(room, message, originWs);
    },
  );

  room.snapshotTimer = setInterval(() => {
    if (room.dirty) {
      snapshotToDb(draftId, ydoc);
      room.dirty = false;
    }
  }, SNAPSHOT_INTERVAL_MS);

  rooms.set(draftId, room);
  return room;
}

export function handleConnection(ws: WsLike, draftId: string, wsData?: WsData) {
  const room = rooms.get(draftId);
  if (!room) return;

  room.connections.add(ws);
  if (wsData) {
    connectionData.set(ws, wsData);
  }

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
}

export function handleMessage(ws: WsLike, draftId: string, message: ArrayBuffer | Buffer) {
  const room = rooms.get(draftId);
  if (!room) return;

  const data = new Uint8Array(message);
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MESSAGE_SYNC: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, room.ydoc, ws);
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
      handleRpcResponse(payload);
      break;
    }
  }
}

export async function handleDisconnect(ws: WsLike, draftId: string) {
  const room = rooms.get(draftId);
  if (!room) return;

  room.connections.delete(ws);
  connectionData.delete(ws);

  if (room.connections.size === 0) {
    if (room.snapshotTimer) {
      clearInterval(room.snapshotTimer);
    }

    if (room.dirty) {
      await snapshotToDb(draftId, room.ydoc);
    }

    if (room.updateHandler) {
      room.ydoc.off('update', room.updateHandler);
    }
    room.awareness.destroy();
    room.ydoc.destroy();
    rooms.delete(draftId);
  }
}

async function snapshotToDb(draftId: string, ydoc: Y.Doc) {
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    await draftsService.saveYjsState(draftId, state);
  } catch (err) {
    console.error(`Failed to snapshot draft ${draftId}:`, err);
  }
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
  if (rpcInterceptor) return true;
  const room = rooms.get(draftId);
  return !!room && room.connections.size > 0;
}

export function sendRpc(
  draftId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (rpcInterceptor) {
    return rpcInterceptor(draftId, tool, args);
  }

  const room = rooms.get(draftId);
  if (!room || room.connections.size === 0) {
    return Promise.reject(new Error('No editor connected'));
  }

  const id = nanoid();
  const payload = JSON.stringify({ id, tool, args });

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_RPC);
  encoding.writeVarString(encoder, payload);
  const message = encoding.toUint8Array(encoder);

  const target = room.connections.values().next().value as WsLike;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRpcs.delete(id);
      reject(new Error('RPC timeout'));
    }, RPC_TIMEOUT_MS);

    pendingRpcs.set(id, { resolve, reject, timer });
    target.send(message);
  });
}

function handleRpcResponse(payload: string) {
  let parsed: { id?: string; result?: unknown; error?: string };
  try {
    parsed = JSON.parse(payload) as typeof parsed;
  } catch {
    return;
  }

  if (!parsed.id) return;

  const pending = pendingRpcs.get(parsed.id);
  if (!pending) return;

  pendingRpcs.delete(parsed.id);
  clearTimeout(pending.timer);

  if (parsed.error) {
    pending.reject(new Error(parsed.error));
  } else {
    pending.resolve(parsed.result);
  }
}

let rpcInterceptor:
  | ((draftId: string, tool: string, args: Record<string, unknown>) => Promise<unknown>)
  | null = null;

export function setRpcInterceptor(
  interceptor:
    | ((draftId: string, tool: string, args: Record<string, unknown>) => Promise<unknown>)
    | null,
) {
  rpcInterceptor = interceptor;
}

export function closeAllRooms() {
  for (const [_draftId, room] of rooms) {
    if (room.snapshotTimer) clearInterval(room.snapshotTimer);
    if (room.updateHandler) room.ydoc.off('update', room.updateHandler);
    room.awareness.destroy();
    room.ydoc.destroy();
  }
  rooms.clear();

  for (const [id, pending] of pendingRpcs) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Server shutting down'));
    pendingRpcs.delete(id);
  }
}
