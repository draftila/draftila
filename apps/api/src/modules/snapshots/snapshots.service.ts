import * as Y from 'yjs';
import type { SnapshotWithAuthor } from '@draftila/shared';
import { NotFoundError } from '../../common/errors';
import { nanoid } from '../../common/lib/utils';
import { nextTimestamp } from '../../common/lib/pagination';
import { db } from '../../db';
import * as draftsService from '../drafts/drafts.service';
import { getRoomYDoc, destroyRoom } from '../collaboration/collaboration.service';

const MAX_AUTO_SAVES = 50;
const MAX_LIST_RESULTS = 200;

const snapshotListSelect = {
  id: true,
  draftId: true,
  userId: true,
  name: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

function mapSnapshot(row: {
  id: string;
  draftId: string;
  userId: string | null;
  name: string | null;
  createdAt: Date;
  user: { id: string; name: string } | null;
}): SnapshotWithAuthor {
  return {
    id: row.id,
    draftId: row.draftId,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt,
    author: row.user,
  };
}

export async function listByDraft(
  draftId: string,
  includeAutoSaves: boolean,
): Promise<SnapshotWithAuthor[]> {
  const where = includeAutoSaves ? { draftId } : { draftId, NOT: { name: null } };

  const rows = await db.snapshot.findMany({
    where,
    select: snapshotListSelect,
    orderBy: { createdAt: 'desc' },
    take: MAX_LIST_RESULTS,
  });

  return rows.map(mapSnapshot);
}

export async function createNamedVersion(
  draftId: string,
  userId: string,
  name: string,
): Promise<SnapshotWithAuthor> {
  const roomDoc = getRoomYDoc(draftId);
  let state: Uint8Array;

  if (roomDoc) {
    state = Y.encodeStateAsUpdate(roomDoc);
  } else {
    const saved = await draftsService.loadYjsState(draftId);
    if (!saved) {
      state = Y.encodeStateAsUpdate(new Y.Doc());
    } else {
      state = new Uint8Array(saved);
    }
  }

  const id = nanoid();
  const timestamp = nextTimestamp();

  const row = await db.snapshot.create({
    data: {
      id,
      draftId,
      userId,
      name,
      yjsState: new Uint8Array(state),
      createdAt: timestamp,
    },
    select: snapshotListSelect,
  });

  return mapSnapshot(row);
}

export async function createAutoSave(
  draftId: string,
  userId: string | null,
  state: Buffer,
): Promise<void> {
  const id = nanoid();
  const timestamp = nextTimestamp();

  await db.snapshot.create({
    data: {
      id,
      draftId,
      userId,
      name: null,
      yjsState: new Uint8Array(state),
      createdAt: timestamp,
    },
  });

  await pruneAutoSaves(draftId);
}

export async function updateName(
  snapshotId: string,
  name: string | null,
): Promise<SnapshotWithAuthor> {
  const existing = await db.snapshot.findUnique({
    where: { id: snapshotId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError('Snapshot');
  }

  const row = await db.snapshot.update({
    where: { id: snapshotId },
    data: { name },
    select: snapshotListSelect,
  });

  return mapSnapshot(row);
}

export async function getState(snapshotId: string): Promise<Buffer> {
  const row = await db.snapshot.findUnique({
    where: { id: snapshotId },
    select: { yjsState: true },
  });

  if (!row) {
    throw new NotFoundError('Snapshot');
  }

  return Buffer.from(row.yjsState);
}

export async function getDraftIdForSnapshot(snapshotId: string): Promise<string | null> {
  const row = await db.snapshot.findUnique({
    where: { id: snapshotId },
    select: { draftId: true },
  });

  return row?.draftId ?? null;
}

async function pruneAutoSaves(draftId: string): Promise<void> {
  const autoSaves = await db.snapshot.findMany({
    where: { draftId, name: null },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  if (autoSaves.length <= MAX_AUTO_SAVES) return;

  const toDelete = autoSaves.slice(MAX_AUTO_SAVES).map((s) => s.id);

  await db.snapshot.deleteMany({
    where: { id: { in: toDelete } },
  });
}

export async function restoreSnapshot(
  draftId: string,
  snapshotId: string,
  userId: string,
): Promise<SnapshotWithAuthor> {
  const snapshot = await db.snapshot.findUnique({
    where: { id: snapshotId },
    select: { id: true, draftId: true, name: true, yjsState: true },
  });

  if (!snapshot || snapshot.draftId !== draftId) {
    throw new NotFoundError('Snapshot');
  }

  const roomDoc = getRoomYDoc(draftId);
  let currentState: Buffer;

  if (roomDoc) {
    currentState = Buffer.from(Y.encodeStateAsUpdate(roomDoc));
  } else {
    const saved = await draftsService.loadYjsState(draftId);
    currentState = saved ? Buffer.from(saved) : Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));
  }

  await createAutoSave(draftId, userId, currentState);

  const restoreName = snapshot.name ? `Restored from ${snapshot.name}` : 'Restored from auto-save';

  const id = nanoid();
  const timestamp = nextTimestamp();

  const row = await db.snapshot.create({
    data: {
      id,
      draftId,
      userId,
      name: restoreName,
      yjsState: new Uint8Array(snapshot.yjsState),
      createdAt: timestamp,
    },
    select: snapshotListSelect,
  });

  await draftsService.saveYjsState(draftId, Buffer.from(snapshot.yjsState));

  destroyRoom(draftId);

  return mapSnapshot(row);
}
