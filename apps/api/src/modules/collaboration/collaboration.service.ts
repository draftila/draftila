import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as draftsService from '../drafts/drafts.service';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

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

const rooms = new Map<string, Room>();

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
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
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
    if (room.dirty) {
      snapshotToDb(draftId, ydoc);
      room.dirty = false;
    }
  }, SNAPSHOT_INTERVAL_MS);

  rooms.set(draftId, room);
  return room;
}

export function handleConnection(ws: WsLike, draftId: string) {
  const room = rooms.get(draftId);
  if (!room) return;

  room.connections.add(ws);

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
  }
}

export async function handleDisconnect(ws: WsLike, draftId: string) {
  const room = rooms.get(draftId);
  if (!room) return;

  room.connections.delete(ws);

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

export function closeAllRooms() {
  for (const [_draftId, room] of rooms) {
    if (room.snapshotTimer) clearInterval(room.snapshotTimer);
    if (room.updateHandler) room.ydoc.off('update', room.updateHandler);
    room.awareness.destroy();
    room.ydoc.destroy();
  }
  rooms.clear();
}
