import { describe, test, expect, beforeEach } from 'bun:test';
import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { addShape, initDocument, getZOrder } from '../src/scene-graph';
import { ensureDefaultPage } from '../src/pages';

let ydoc: Y.Doc;

function order(): string[] {
  return getZOrder(ydoc).toArray();
}

function add(props: Partial<Shape> = {}, childIndex?: number): string {
  return addShape(ydoc, 'rectangle', props, childIndex);
}

beforeEach(() => {
  ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
});

describe('addShape z-order placement', () => {
  test('appends root-level shapes in creation order', () => {
    const first = add();
    const second = add();
    expect(order()).toEqual([first, second]);
  });

  test('places a child immediately after its parent', () => {
    const frame = addShape(ydoc, 'frame', {});
    const trailing = add();
    const child = add({ parentId: frame } as Partial<Shape>);

    expect(order()).toEqual([frame, child, trailing]);
  });

  test('places a new child after the parent last nested descendant', () => {
    const frame = addShape(ydoc, 'frame', {});
    const inner = addShape(ydoc, 'frame', { parentId: frame } as Partial<Shape>);
    const grandchild = add({ parentId: inner } as Partial<Shape>);
    const trailing = add();

    const sibling = add({ parentId: frame } as Partial<Shape>);

    expect(order()).toEqual([frame, inner, grandchild, sibling, trailing]);
  });

  test('an explicit childIndex lands before the sibling at that index', () => {
    const frame = addShape(ydoc, 'frame', {});
    const first = add({ parentId: frame } as Partial<Shape>);
    const second = add({ parentId: frame } as Partial<Shape>);

    const inserted = add({ parentId: frame } as Partial<Shape>, 1);

    expect(order()).toEqual([frame, first, inserted, second]);
  });

  test('a childIndex past the end appends within the parent', () => {
    const frame = addShape(ydoc, 'frame', {});
    const first = add({ parentId: frame } as Partial<Shape>);
    const appended = add({ parentId: frame } as Partial<Shape>, 99);

    expect(order()).toEqual([frame, first, appended]);
  });

  test('an unknown parentId places the shape at the front (pre-existing behaviour)', () => {
    const existing = add();
    const orphan = add({ parentId: 'does-not-exist' } as Partial<Shape>);

    expect(order()).toEqual([orphan, existing]);
  });

  test('does not leave duplicate ids in the z-order array', () => {
    const frame = addShape(ydoc, 'frame', {});
    const inner = addShape(ydoc, 'frame', { parentId: frame } as Partial<Shape>);
    add({ parentId: inner } as Partial<Shape>);
    add({ parentId: frame } as Partial<Shape>);
    add();

    const ids = order();
    expect(ids).toHaveLength(new Set(ids).size);
  });
});
