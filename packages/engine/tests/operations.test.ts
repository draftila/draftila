import { describe, test, expect, beforeEach } from 'bun:test';
import * as Y from 'yjs';
import { initDocument, addShape, getShape, getChildShapes } from '../src/scene-graph';
import {
  opCreateShape,
  opUpdateShape,
  opBatchUpdateShapes,
  opDeleteShapes,
  opNudgeShapes,
  opGroupShapes,
  opUngroupShapes,
  opFrameSelection,
  opMoveByDrop,
  opAlignShapes,
  opDistributeShapes,
  opDuplicateShapesInPlace,
  opFlipShapes,
  opMoveInStack,
} from '../src/operations';

let ydoc: Y.Doc;

function createAutoLayoutFrame(ydoc: Y.Doc, props: Record<string, unknown> = {}): string {
  return addShape(ydoc, 'frame', {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    layoutMode: 'vertical',
    layoutGap: 10,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 10,
    layoutSizingHorizontal: 'fixed',
    layoutSizingVertical: 'hug',
    ...props,
  } as Record<string, unknown>);
}

function createChild(ydoc: Y.Doc, parentId: string, height = 40): string {
  const parent = getShape(ydoc, parentId)!;
  return addShape(ydoc, 'rectangle', {
    x: parent.x + 10,
    y: parent.y,
    width: 380,
    height,
    parentId,
  });
}

beforeEach(() => {
  ydoc = new Y.Doc();
  initDocument(ydoc);
});

describe('opCreateShape', () => {
  test('creates shape and triggers auto-layout on parent', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);

    const child2 = opCreateShape(ydoc, 'rectangle', {
      x: 0,
      y: 0,
      width: 380,
      height: 60,
      parentId: frameId,
    });

    const frame = getShape(ydoc, frameId)!;
    const c1 = getShape(ydoc, child1)!;
    const c2 = getShape(ydoc, child2)!;

    expect(c1.y).toBe(frame.y + 10);
    expect(c2.y).toBe(frame.y + 10 + 40 + 10);
  });
});

describe('opUpdateShape', () => {
  test('nudges children when group x/y changes', () => {
    const r1 = addShape(ydoc, 'rectangle', { x: 0, y: 0, width: 50, height: 50 });
    const r2 = addShape(ydoc, 'rectangle', { x: 60, y: 0, width: 50, height: 50 });
    const groupId = opGroupShapes(ydoc, [r1, r2])!;

    opUpdateShape(ydoc, groupId, { x: 100, y: 100 });

    const child = getShape(ydoc, r1)!;
    expect(child.x).toBe(100);
    expect(child.y).toBe(100);
  });

  test('applies auto-layout when updating auto-layout frame properties', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    const child2 = createChild(ydoc, frameId, 40);

    opUpdateShape(ydoc, frameId, { layoutGap: 20 } as Partial<Record<string, unknown>>);

    const c1 = getShape(ydoc, child1)!;
    const c2 = getShape(ydoc, child2)!;
    const gap = c2.y - (c1.y + c1.height);
    expect(gap).toBe(20);
  });

  test('cascades auto-layout to ancestors', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    createChild(ydoc, frameId, 40);

    opUpdateShape(ydoc, child1, { height: 80 });

    const frame = getShape(ydoc, frameId)!;
    expect(frame.height).toBeGreaterThan(100);
  });
});

describe('opBatchUpdateShapes', () => {
  test('deduplicates ancestor cascade across updates', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    const child2 = createChild(ydoc, frameId, 40);

    opBatchUpdateShapes(ydoc, [
      { shapeId: child1, props: { height: 60 } },
      { shapeId: child2, props: { height: 80 } },
    ]);

    const frame = getShape(ydoc, frameId)!;
    expect(frame.height).toBe(10 + 60 + 10 + 80 + 10);
  });
});

describe('opDeleteShapes', () => {
  test('triggers auto-layout on parent after deletion', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    const child2 = createChild(ydoc, frameId, 40);
    const child3 = createChild(ydoc, frameId, 40);

    opDeleteShapes(ydoc, [child2]);

    const c1 = getShape(ydoc, child1)!;
    const c3 = getShape(ydoc, child3)!;
    const frame = getShape(ydoc, frameId)!;

    expect(c3.y).toBe(c1.y + c1.height + 10);
    expect(frame.height).toBe(10 + 40 + 10 + 40 + 10);
  });
});

describe('opNudgeShapes', () => {
  test('triggers auto-layout on ancestors', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);

    opNudgeShapes(ydoc, [child1], 0, 50);

    const frame = getShape(ydoc, frameId)!;
    const c1 = getShape(ydoc, child1)!;
    expect(c1.y).toBe(frame.y + 10);
  });
});

describe('opGroupShapes', () => {
  test('creates group and triggers auto-layout on ancestors', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    const child2 = createChild(ydoc, frameId, 40);

    const groupId = opGroupShapes(ydoc, [child1, child2]);

    expect(groupId).not.toBeNull();
    const frame = getShape(ydoc, frameId)!;
    expect(frame.height).toBeGreaterThan(0);
  });
});

describe('opUngroupShapes', () => {
  test('releases children and triggers auto-layout', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    const child2 = createChild(ydoc, frameId, 40);

    const groupId = opGroupShapes(ydoc, [child1, child2]);
    expect(groupId).not.toBeNull();

    const childIds = opUngroupShapes(ydoc, [groupId!]);
    expect(childIds.length).toBe(2);

    const frame = getShape(ydoc, frameId)!;
    expect(frame.height).toBeGreaterThan(0);
  });
});

describe('opFrameSelection', () => {
  test('wraps shapes in frame and triggers auto-layout', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);
    const child2 = createChild(ydoc, frameId, 40);

    const newFrameId = opFrameSelection(ydoc, [child1, child2]);
    expect(newFrameId).not.toBeNull();

    const parentFrame = getShape(ydoc, frameId)!;
    expect(parentFrame.height).toBeGreaterThan(0);
  });
});

describe('opMoveByDrop', () => {
  test('triggers auto-layout after reparenting', () => {
    const frame1 = createAutoLayoutFrame(ydoc, { x: 0 });
    const child1 = createChild(ydoc, frame1, 40);
    createChild(ydoc, frame1, 40);

    const frame2 = createAutoLayoutFrame(ydoc, { x: 500 });
    const child3 = createChild(ydoc, frame2, 40);

    opMoveByDrop(ydoc, [child1], child3, 'after');

    const f2Children = getChildShapes(ydoc, frame2);
    expect(f2Children.length).toBe(2);
  });
});

describe('opFlipShapes', () => {
  test('flips shapes without error', () => {
    const id = addShape(ydoc, 'rectangle', { x: 0, y: 0, width: 100, height: 50 });
    opFlipShapes(ydoc, [id], 'horizontal');
    const shape = getShape(ydoc, id)!;
    expect(shape).not.toBeNull();
  });
});

describe('opMoveInStack', () => {
  test('reorders z-order', () => {
    const r1 = addShape(ydoc, 'rectangle', { x: 0, y: 0, width: 10, height: 10 });
    addShape(ydoc, 'rectangle', { x: 0, y: 0, width: 10, height: 10 });
    const movedIds = opMoveInStack(ydoc, [r1], 'forward');
    expect(movedIds).toContain(r1);
  });
});

describe('opAlignShapes', () => {
  test('aligns shapes and triggers auto-layout', () => {
    const s1 = addShape(ydoc, 'rectangle', { x: 0, y: 0, width: 50, height: 50 });
    const s2 = addShape(ydoc, 'rectangle', { x: 100, y: 0, width: 50, height: 50 });

    opAlignShapes(ydoc, [s1, s2], 'left');

    const shape2 = getShape(ydoc, s2)!;
    expect(shape2.x).toBe(0);
  });
});

describe('opDistributeShapes', () => {
  test('distributes shapes evenly', () => {
    const s1 = addShape(ydoc, 'rectangle', { x: 0, y: 0, width: 50, height: 50 });
    const s2 = addShape(ydoc, 'rectangle', { x: 50, y: 0, width: 50, height: 50 });
    const s3 = addShape(ydoc, 'rectangle', { x: 200, y: 0, width: 50, height: 50 });

    opDistributeShapes(ydoc, [s1, s2, s3], 'horizontal');

    const shape2 = getShape(ydoc, s2)!;
    expect(shape2.x).toBe(100);
  });
});

describe('opDuplicateShapesInPlace', () => {
  test('duplicates and triggers auto-layout', () => {
    const frameId = createAutoLayoutFrame(ydoc);
    const child1 = createChild(ydoc, frameId, 40);

    const idMap = opDuplicateShapesInPlace(ydoc, [child1]);
    expect(idMap.size).toBe(1);

    const children = getChildShapes(ydoc, frameId);
    expect(children.length).toBe(2);
  });
});
