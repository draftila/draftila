import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { initDocument, getShape } from '../src/scene-graph';
import { ensureDefaultPage } from '../src/pages';
import { opBatchCreateShapes, opCreateShape } from '../src/operations';

function createDoc() {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
  return ydoc;
}

const CARD_FRAME = {
  x: 100,
  y: 100,
  width: 50,
  height: 50,
  layoutMode: 'vertical',
  layoutSizingHorizontal: 'hug',
  layoutSizingVertical: 'hug',
  layoutGap: 10,
  paddingTop: 20,
  paddingRight: 20,
  paddingBottom: 20,
  paddingLeft: 20,
} as Partial<Shape>;

const CHILD_RECT = { x: 0, y: 0, width: 100, height: 30 } as Partial<Shape>;

describe('opBatchCreateShapes', () => {
  test('creates the whole batch in a single yjs transaction', () => {
    const ydoc = createDoc();
    let updates = 0;
    ydoc.on('update', () => {
      updates += 1;
    });

    const ids = opBatchCreateShapes(ydoc, [
      { type: 'frame', props: CARD_FRAME },
      { type: 'rectangle', props: CHILD_RECT, parentRef: 0 },
      { type: 'rectangle', props: CHILD_RECT, parentRef: 0 },
      { type: 'text', props: { x: 0, y: 0, width: 120, height: 20, content: 'Hi' } },
    ]);

    expect(ids).toHaveLength(4);
    expect(updates).toBe(1);
  });

  test('resolves parentRef and converts child coordinates to absolute', () => {
    const ydoc = createDoc();
    const ids = opBatchCreateShapes(ydoc, [
      { type: 'frame', props: { x: 200, y: 300, width: 400, height: 400 } as Partial<Shape> },
      { type: 'rectangle', props: { x: 10, y: 20, width: 50, height: 50 }, parentRef: 0 },
    ]);

    const child = getShape(ydoc, ids[1]!)!;
    expect(child.parentId).toBe(ids[0]!);
    expect(child.x).toBe(210);
    expect(child.y).toBe(320);
  });

  test('matches sequential opCreateShape layout output', () => {
    const batchDoc = createDoc();
    const batchIds = opBatchCreateShapes(batchDoc, [
      { type: 'frame', props: CARD_FRAME },
      { type: 'rectangle', props: CHILD_RECT, parentRef: 0 },
      { type: 'rectangle', props: CHILD_RECT, parentRef: 0 },
    ]);

    const seqDoc = createDoc();
    const frameId = opCreateShape(seqDoc, 'frame', CARD_FRAME);
    const seqIds = [
      frameId,
      opCreateShape(seqDoc, 'rectangle', { ...CHILD_RECT, x: 100, y: 100, parentId: frameId }),
      opCreateShape(seqDoc, 'rectangle', { ...CHILD_RECT, x: 100, y: 100, parentId: frameId }),
    ];

    for (let i = 0; i < batchIds.length; i++) {
      const batchShape = getShape(batchDoc, batchIds[i]!)!;
      const seqShape = getShape(seqDoc, seqIds[i]!)!;
      expect(batchShape.x).toBe(seqShape.x);
      expect(batchShape.y).toBe(seqShape.y);
      expect(batchShape.width).toBe(seqShape.width);
      expect(batchShape.height).toBe(seqShape.height);
    }

    const frame = getShape(batchDoc, batchIds[0]!)!;
    expect(frame.width).toBe(140);
    expect(frame.height).toBe(110);
  });

  test('lays out nested hug frames deepest-first', () => {
    const ydoc = createDoc();
    const ids = opBatchCreateShapes(ydoc, [
      { type: 'frame', props: CARD_FRAME },
      { type: 'frame', props: { ...CARD_FRAME, x: 0, y: 0 }, parentRef: 0 },
      { type: 'rectangle', props: CHILD_RECT, parentRef: 1 },
    ]);

    const inner = getShape(ydoc, ids[1]!)!;
    const outer = getShape(ydoc, ids[0]!)!;
    expect(inner.width).toBe(140);
    expect(inner.height).toBe(70);
    expect(outer.width).toBe(180);
    expect(outer.height).toBe(110);
  });
});
