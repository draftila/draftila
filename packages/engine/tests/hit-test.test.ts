import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import { hitTestPoint, hitTestRect } from '../src/hit-test';
import { SpatialIndex } from '../src/spatial-index';

function makeShape(overrides: Partial<Shape> & { id: string; type: Shape['type'] }): Shape {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    visible: true,
    locked: false,
    name: '',
    opacity: 1,
    parentId: null,
    fills: [],
    strokes: [],
    ...overrides,
  } as Shape;
}

function hitTest(shapes: Shape[], px: number, py: number, zoom = 1): Shape | null {
  const index = new SpatialIndex();
  index.rebuild(shapes);
  return hitTestPoint(px, py, shapes, index, zoom);
}

describe('hitTestPoint', () => {
  describe('rectangle', () => {
    test('hits inside rectangle', () => {
      const shape = makeShape({ id: 'r1', type: 'rectangle', x: 10, y: 10, width: 80, height: 60 });
      expect(hitTest([shape], 50, 40)).toBe(shape);
    });

    test('misses outside rectangle', () => {
      const shape = makeShape({ id: 'r1', type: 'rectangle', x: 10, y: 10, width: 80, height: 60 });
      expect(hitTest([shape], 0, 0)).toBeNull();
    });

    test('hits inside rotated rectangle', () => {
      const shape = makeShape({
        id: 'r1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        rotation: 45,
      });
      const cx = 50;
      const cy = 10;
      expect(hitTest([shape], cx, cy)).toBe(shape);
    });

    test('misses corner of rotated rectangle', () => {
      const shape = makeShape({
        id: 'r1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 10,
        rotation: 45,
      });
      expect(hitTest([shape], 0, 0)).toBeNull();
    });
  });

  describe('ellipse', () => {
    test('hits inside ellipse', () => {
      const shape = makeShape({ id: 'e1', type: 'ellipse', x: 0, y: 0, width: 100, height: 100 });
      expect(hitTest([shape], 50, 50)).toBe(shape);
    });

    test('misses corner of ellipse bounding box', () => {
      const shape = makeShape({ id: 'e1', type: 'ellipse', x: 0, y: 0, width: 100, height: 100 });
      expect(hitTest([shape], 2, 2)).toBeNull();
    });

    test('hits inside rotated ellipse', () => {
      const shape = makeShape({
        id: 'e1',
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 200,
        height: 40,
        rotation: 90,
      });
      const cx = 100;
      const cy = 20;
      expect(hitTest([shape], cx, cy)).toBe(shape);
    });
  });

  describe('polygon', () => {
    test('hits inside polygon', () => {
      const shape = makeShape({
        id: 'p1',
        type: 'polygon',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sides: 6,
      } as Partial<Shape> & { id: string; type: 'polygon' });
      expect(hitTest([shape], 50, 50)).toBe(shape);
    });

    test('hits inside rotated polygon', () => {
      const shape = makeShape({
        id: 'p1',
        type: 'polygon',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sides: 4,
        rotation: 45,
      } as Partial<Shape> & { id: string; type: 'polygon' });
      expect(hitTest([shape], 50, 50)).toBe(shape);
    });
  });

  describe('star', () => {
    test('hits center of star', () => {
      const shape = makeShape({
        id: 's1',
        type: 'star',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        points: 5,
        innerRadius: 0.5,
      } as Partial<Shape> & { id: string; type: 'star' });
      expect(hitTest([shape], 50, 50)).toBe(shape);
    });

    test('hits center of rotated star', () => {
      const shape = makeShape({
        id: 's1',
        type: 'star',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        points: 5,
        innerRadius: 0.5,
        rotation: 36,
      } as Partial<Shape> & { id: string; type: 'star' });
      expect(hitTest([shape], 50, 50)).toBe(shape);
    });
  });

  describe('line', () => {
    test('hits near horizontal line', () => {
      const shape = makeShape({
        id: 'l1',
        type: 'line',
        x: 0,
        y: 0,
        width: 100,
        height: 1,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
      } as Partial<Shape> & { id: string; type: 'line' });
      expect(hitTest([shape], 50, 2)).toBe(shape);
    });

    test('misses line far away', () => {
      const shape = makeShape({
        id: 'l1',
        type: 'line',
        x: 0,
        y: 0,
        width: 100,
        height: 1,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
      } as Partial<Shape> & { id: string; type: 'line' });
      expect(hitTest([shape], 50, 50)).toBeNull();
    });
  });

  describe('z-order', () => {
    test('returns topmost shape when overlapping', () => {
      const bottom = makeShape({
        id: 'r1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const top = makeShape({ id: 'r2', type: 'rectangle', x: 0, y: 0, width: 100, height: 100 });
      expect(hitTest([bottom, top], 50, 50)).toBe(top);
    });
  });

  describe('visibility and locking', () => {
    test('skips invisible shapes', () => {
      const shape = makeShape({
        id: 'r1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visible: false,
      });
      expect(hitTest([shape], 50, 50)).toBeNull();
    });

    test('skips locked shapes', () => {
      const shape = makeShape({
        id: 'r1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        locked: true,
      });
      expect(hitTest([shape], 50, 50)).toBeNull();
    });
  });

  describe('tolerance at extreme zoom', () => {
    test('shapes remain clickable at very high zoom', () => {
      const shape = makeShape({
        id: 'l1',
        type: 'line',
        x: 0,
        y: 0,
        width: 100,
        height: 1,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
      } as Partial<Shape> & { id: string; type: 'line' });
      expect(hitTest([shape], 50, 0.5, 100)).toBe(shape);
    });
  });
});

describe('hitTestRect', () => {
  test('returns shapes within marquee', () => {
    const inside = makeShape({ id: 'r1', type: 'rectangle', x: 10, y: 10, width: 20, height: 20 });
    const outside = makeShape({
      id: 'r2',
      type: 'rectangle',
      x: 200,
      y: 200,
      width: 20,
      height: 20,
    });
    const index = new SpatialIndex();
    index.rebuild([inside, outside]);
    const result = hitTestRect(0, 0, 50, 50, [inside, outside], index);
    expect(result).toContain(inside);
    expect(result).not.toContain(outside);
  });
});
