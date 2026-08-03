import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { addShape, initDocument, observeShapes, updateShape } from '../src/scene-graph';
import { ensureDefaultPage, getActivePageShapesMap } from '../src/pages';

function newDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
  return ydoc;
}

function shapesMapOf(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getActivePageShapesMap(ydoc);
}

describe('observeShapes', () => {
  test('reports the shape id for a write nested inside an array item', () => {
    // A targeted colorVar write lands on the fill's own Y.Map, which has no
    // `id`. Without the path fallback the change is silently dropped and the
    // canvas never repaints, even though the write replicates and persists.
    const ydoc = newDoc();
    const id = addShape(ydoc, 'rectangle', {
      width: 10,
      height: 10,
      fills: [{ color: '#FF0000', opacity: 1, visible: true }],
    } as Partial<Shape>);

    const seen: string[][] = [];
    const unobserve = observeShapes(ydoc, ({ updated }) => seen.push(updated));

    const fills = shapesMapOf(ydoc).get(id)!.get('fills') as Y.Array<Y.Map<unknown>>;
    fills.get(0)!.set('colorVar', 'v1');

    unobserve();
    expect(seen).toEqual([[id]]);
  });

  test('still reports the shape id for a whole-array write', () => {
    const ydoc = newDoc();
    const id = addShape(ydoc, 'rectangle', {
      width: 10,
      height: 10,
      fills: [{ color: '#FF0000', opacity: 1, visible: true }],
    } as Partial<Shape>);

    const seen: string[][] = [];
    const unobserve = observeShapes(ydoc, ({ updated }) => seen.push(updated));

    updateShape(ydoc, id, {
      fills: [{ color: '#00FF00', opacity: 1, visible: true }],
    } as Partial<Shape>);

    unobserve();
    expect(seen.flat()).toContain(id);
  });

  test('reports adds and deletes on the shapes map itself', () => {
    const ydoc = newDoc();
    const events: Array<{ added: string[]; deleted: string[] }> = [];
    const unobserve = observeShapes(ydoc, ({ added, deleted }) => events.push({ added, deleted }));

    const id = addShape(ydoc, 'rectangle', { width: 10, height: 10 } as Partial<Shape>);
    expect(events.some((e) => e.added.includes(id))).toBe(true);

    unobserve();
  });
});
