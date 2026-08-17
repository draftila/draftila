import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { initDocument, addShape, getShape } from '../src/scene-graph';
import { ensureDefaultPage } from '../src/pages';
import {
  applyAutoLayoutForShapes,
  applyAutoLayoutForAncestors,
} from '../src/scene-graph/layout-ops';

const HUG: Partial<Shape> = {
  layoutMode: 'vertical',
  layoutSizingVertical: 'hug',
  layoutSizingHorizontal: 'hug',
} as Partial<Shape>;

function buildNestedFrames() {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);

  const outer = addShape(ydoc, 'frame', {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...HUG,
  } as Partial<Shape>);
  const inner = addShape(ydoc, 'frame', {
    parentId: outer,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    ...HUG,
  } as Partial<Shape>);
  const shallowChild = addShape(ydoc, 'rectangle', {
    parentId: outer,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
  } as Partial<Shape>);
  const deepChild = addShape(ydoc, 'rectangle', {
    parentId: inner,
    x: 0,
    y: 0,
    width: 40,
    height: 90,
  } as Partial<Shape>);

  return { ydoc, outer, inner, shallowChild, deepChild };
}

function sizeOf(ydoc: Y.Doc, id: string) {
  const shape = getShape(ydoc, id)!;
  return { width: shape.width, height: shape.height };
}

describe('applyAutoLayoutForShapes', () => {
  test('settles inner frames before their ancestors regardless of input order', () => {
    const { ydoc, outer, inner, shallowChild, deepChild } = buildNestedFrames();

    applyAutoLayoutForShapes(ydoc, [shallowChild, deepChild]);

    expect(sizeOf(ydoc, inner)).toEqual({ width: 40, height: 90 });
    expect(sizeOf(ydoc, outer)).toEqual({ width: 40, height: 130 });
  });

  test('matches the per-shape ancestor walk it replaces', () => {
    const batched = buildNestedFrames();
    applyAutoLayoutForShapes(batched.ydoc, [batched.shallowChild, batched.deepChild]);

    const perShape = buildNestedFrames();
    applyAutoLayoutForAncestors(perShape.ydoc, perShape.shallowChild);
    applyAutoLayoutForAncestors(perShape.ydoc, perShape.deepChild);

    expect(sizeOf(batched.ydoc, batched.outer)).toEqual(sizeOf(perShape.ydoc, perShape.outer));
    expect(sizeOf(batched.ydoc, batched.inner)).toEqual(sizeOf(perShape.ydoc, perShape.inner));
  });
});
