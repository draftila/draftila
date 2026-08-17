import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { db } from '../../src/db';
import { cleanDatabase } from '../helpers';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import {
  closeRoom,
  destroyRoom,
  getOrCreateRoom,
  getRoomCount,
} from '../../src/modules/collaboration/collaboration.service';

let draftId: string;

async function seedDraft(): Promise<string> {
  const user = await db.user.create({
    data: {
      id: 'collab-user',
      name: 'Collab',
      email: 'collab@draftila.test',
      updatedAt: new Date(),
    },
  });
  const project = await db.project.create({
    data: { id: 'collab-project', name: 'Collab', ownerId: user.id, updatedAt: new Date() },
  });
  const draft = await db.draft.create({
    data: { id: 'collab-draft', name: 'Collab', projectId: project.id, updatedAt: new Date() },
  });
  return draft.id;
}

function shapeIds(state: Buffer): string[] {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  const ids = Array.from((doc.getMap('shapes') as Y.Map<unknown>).keys()).sort();
  doc.destroy();
  return ids;
}

function addShapeTo(ydoc: Y.Doc, id: string) {
  const shapes = ydoc.getMap('shapes') as Y.Map<Y.Map<unknown>>;
  ydoc.transact(() => {
    const shape = new Y.Map<unknown>();
    shape.set('id', id);
    shape.set('type', 'rectangle');
    shapes.set(id, shape);
  });
}

beforeEach(async () => {
  await cleanDatabase();
  draftId = await seedDraft();
});

afterEach(() => {
  destroyRoom(draftId);
});

describe('collaboration update log', () => {
  test('appendYjsUpdate returns an increasing id and loadYjsUpdates replays in order', async () => {
    const first = await draftsService.appendYjsUpdate(draftId, Buffer.from([1, 2, 3]));
    const second = await draftsService.appendYjsUpdate(draftId, Buffer.from([4, 5, 6]));

    expect(second).toBeGreaterThan(first);

    const updates = await draftsService.loadYjsUpdates(draftId);
    expect(updates.map((u) => u.id)).toEqual([first, second]);
    expect(Array.from(updates[0]!.payload)).toEqual([1, 2, 3]);
  });

  test('closing a room with edits writes a log row rather than the full state', async () => {
    const room = await getOrCreateRoom(draftId);
    addShapeTo(room.ydoc, 'shape-a');

    await closeRoom(draftId);

    const state = await draftsService.loadYjsState(draftId);
    expect(state).not.toBeNull();
    expect(shapeIds(Buffer.from(state!))).toEqual(['shape-a']);
  });

  test('a reopened room matches the document from before it closed', async () => {
    const room = await getOrCreateRoom(draftId);
    addShapeTo(room.ydoc, 'shape-a');
    addShapeTo(room.ydoc, 'shape-b');
    const before = Buffer.from(Y.encodeStateAsUpdate(room.ydoc));
    await closeRoom(draftId);

    const reopened = await getOrCreateRoom(draftId);
    const after = Buffer.from(Y.encodeStateAsUpdate(reopened.ydoc));

    expect(shapeIds(after)).toEqual(shapeIds(before));
    expect(getRoomCount()).toBe(1);
  });

  test('closing a read-only room does not write anything', async () => {
    await draftsService.saveYjsState(draftId, Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())));
    const before = await draftsService.loadYjsState(draftId);

    await getOrCreateRoom(draftId);
    await closeRoom(draftId);

    const after = await draftsService.loadYjsState(draftId);
    expect(Array.from(after!)).toEqual(Array.from(before!));
    expect(await draftsService.loadYjsUpdates(draftId)).toHaveLength(0);
  });

  test('compactYjsState folds the log into the base state and drops consumed rows', async () => {
    const doc = new Y.Doc();
    addShapeTo(doc, 'shape-a');
    const first = await draftsService.appendYjsUpdate(
      draftId,
      Buffer.from(Y.encodeStateAsUpdate(doc)),
    );
    const trailing = await draftsService.appendYjsUpdate(draftId, Buffer.from([9, 9]));

    await draftsService.compactYjsState(draftId, Buffer.from(Y.encodeStateAsUpdate(doc)), first);

    const remaining = await draftsService.loadYjsUpdates(draftId);
    expect(remaining.map((u) => u.id)).toEqual([trailing]);

    const base = await draftsService.loadYjsState(draftId);
    expect(shapeIds(Buffer.from(base!))).toEqual(['shape-a']);
  });

  test('loadFullYjsState includes uncompacted log rows', async () => {
    const base = new Y.Doc();
    addShapeTo(base, 'shape-a');
    await draftsService.saveYjsState(draftId, Buffer.from(Y.encodeStateAsUpdate(base)));

    const delta = new Y.Doc();
    Y.applyUpdate(delta, Y.encodeStateAsUpdate(base));
    addShapeTo(delta, 'shape-b');
    await draftsService.appendYjsUpdate(draftId, Buffer.from(Y.encodeStateAsUpdate(delta)));

    const full = await draftsService.loadFullYjsState(draftId);
    expect(shapeIds(full!)).toEqual(['shape-a', 'shape-b']);
  });

  test('exportDraft reflects uncompacted log rows', async () => {
    const base = new Y.Doc();
    addShapeTo(base, 'shape-a');
    await draftsService.saveYjsState(draftId, Buffer.from(Y.encodeStateAsUpdate(base)));

    const delta = new Y.Doc();
    Y.applyUpdate(delta, Y.encodeStateAsUpdate(base));
    addShapeTo(delta, 'shape-b');
    await draftsService.appendYjsUpdate(draftId, Buffer.from(Y.encodeStateAsUpdate(delta)));

    const exported = await draftsService.exportDraft(draftId);
    expect(exported).not.toBeNull();
  });
});
