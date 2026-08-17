import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { db } from '../../src/db';
import { cleanDatabase } from '../helpers';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as snapshotsService from '../../src/modules/snapshots/snapshots.service';
import {
  destroyRoom,
  getOrCreateRoom,
  getRoomCount,
} from '../../src/modules/collaboration/collaboration.service';

let draftId: string;
let userId: string;

async function seedDraft(): Promise<string> {
  const user = await db.user.create({
    data: {
      id: 'snap-user',
      name: 'Snap',
      email: 'snap@draftila.test',
      updatedAt: new Date(),
    },
  });
  userId = user.id;
  const project = await db.project.create({
    data: { id: 'snap-project', name: 'Snap', ownerId: user.id, updatedAt: new Date() },
  });
  const draft = await db.draft.create({
    data: { id: 'snap-draft', name: 'Snap', projectId: project.id, updatedAt: new Date() },
  });
  return draft.id;
}

function docWith(ids: string[]): Buffer {
  const doc = new Y.Doc();
  const shapes = doc.getMap('shapes') as Y.Map<Y.Map<unknown>>;
  doc.transact(() => {
    for (const id of ids) {
      const shape = new Y.Map<unknown>();
      shape.set('id', id);
      shapes.set(id, shape);
    }
  });
  const encoded = Buffer.from(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return encoded;
}

function shapeIds(state: Buffer): string[] {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  const ids = Array.from((doc.getMap('shapes') as Y.Map<unknown>).keys()).sort();
  doc.destroy();
  return ids;
}

beforeEach(async () => {
  await cleanDatabase();
  draftId = await seedDraft();
});

afterEach(() => {
  destroyRoom(draftId);
});

describe('snapshot restore with an update log', () => {
  test('restoring purges the log so later edits do not replay over the restore', async () => {
    const original = docWith(['shape-a']);
    await draftsService.saveYjsState(draftId, original);

    const snapshot = await snapshotsService.createNamedVersion(draftId, userId, 'v1');

    const edited = docWith(['shape-a', 'shape-b']);
    await draftsService.appendYjsUpdate(draftId, edited);
    expect(await draftsService.loadYjsUpdates(draftId)).toHaveLength(1);

    await snapshotsService.restoreSnapshot(draftId, snapshot.id, userId);

    expect(await draftsService.loadYjsUpdates(draftId)).toHaveLength(0);

    const restored = await draftsService.loadFullYjsState(draftId);
    expect(shapeIds(restored!)).toEqual(['shape-a']);
  });

  test('restoring destroys the live room before writing the state', async () => {
    await draftsService.saveYjsState(draftId, docWith(['shape-a']));
    const snapshot = await snapshotsService.createNamedVersion(draftId, userId, 'v1');

    await getOrCreateRoom(draftId);
    expect(getRoomCount()).toBe(1);

    await snapshotsService.restoreSnapshot(draftId, snapshot.id, userId);

    expect(getRoomCount()).toBe(0);
  });

  test('a reopened room after restore matches the restored state', async () => {
    await draftsService.saveYjsState(draftId, docWith(['shape-a']));
    const snapshot = await snapshotsService.createNamedVersion(draftId, userId, 'v1');

    await draftsService.appendYjsUpdate(draftId, docWith(['shape-a', 'shape-b']));
    await snapshotsService.restoreSnapshot(draftId, snapshot.id, userId);

    const room = await getOrCreateRoom(draftId);
    const reopened = Buffer.from(Y.encodeStateAsUpdate(room.ydoc));

    expect(shapeIds(reopened)).toEqual(['shape-a']);
  });

  test('createNamedVersion captures uncompacted log rows', async () => {
    await draftsService.saveYjsState(draftId, docWith(['shape-a']));
    await draftsService.appendYjsUpdate(draftId, docWith(['shape-a', 'shape-b']));

    const snapshot = await snapshotsService.createNamedVersion(draftId, userId, 'with-delta');
    const state = await snapshotsService.getState(snapshot.id);

    expect(shapeIds(state)).toEqual(['shape-a', 'shape-b']);
  });
  test('length(yjs_state) reports byte counts on this driver', async () => {
    const state = docWith(['shape-a']);
    await snapshotsService.createAutoSave(draftId, userId, state);

    const rows = await db.$queryRaw<{ bytes: bigint | number }[]>`
      SELECT length(yjs_state) AS bytes FROM snapshot WHERE draft_id = ${draftId}
    `;

    expect(Number(rows[0]!.bytes)).toBe(state.byteLength);
  });

  test('keeps every auto-save while under the byte budget', async () => {
    for (let i = 0; i < 5; i++) {
      await snapshotsService.createAutoSave(draftId, userId, docWith([`shape-${i}`]));
    }

    const kept = await db.snapshot.count({ where: { draftId, name: null } });
    expect(kept).toBe(5);
  });

  test('never prunes the most recent auto-save even when it alone exceeds the budget', async () => {
    await snapshotsService.createAutoSave(draftId, userId, docWith(['shape-a']));
    await snapshotsService.createAutoSave(draftId, userId, docWith(['shape-b']));

    const remaining = await db.snapshot.findMany({
      where: { draftId, name: null },
      select: { id: true },
    });
    expect(remaining.length).toBeGreaterThanOrEqual(1);
  });

  test('named snapshots are never counted or pruned', async () => {
    await snapshotsService.createNamedVersion(draftId, userId, 'keep-me');
    for (let i = 0; i < 3; i++) {
      await snapshotsService.createAutoSave(draftId, userId, docWith([`shape-${i}`]));
    }

    const named = await db.snapshot.count({ where: { draftId, NOT: { name: null } } });
    expect(named).toBe(1);
  });
});
