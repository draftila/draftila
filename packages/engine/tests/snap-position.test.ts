import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import { snapPosition } from '../src/snap-position';
import { SNAP_THRESHOLD } from '../src/snap-types';

function makeShape(overrides: Partial<Shape> & { id: string }): Shape {
  return {
    type: 'rectangle',
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

describe('snapPosition', () => {
  describe('edge alignment', () => {
    test('snaps left edge to left edge of other shape', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(98, 60, 50, 50, [other], 1);
      expect(result.x).toBe(100);
    });

    test('snaps right edge to left edge of other shape', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(48, 60, 50, 50, [other], 1);
      expect(result.x).toBe(50);
    });

    test('snaps center to center of other shape', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(98, 0, 50, 50, [other], 1);
      expect(result.x).toBe(100);
    });

    test('snaps top edge to bottom edge of other shape', () => {
      const other = makeShape({ id: 'other', x: 0, y: 0, width: 50, height: 100 });
      const result = snapPosition(0, 102, 50, 50, [other], 1);
      expect(result.y).toBe(100);
    });
  });

  describe('threshold', () => {
    test('does not snap when beyond threshold', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(88, 60, 50, 50, [other], 1);
      expect(result.x).toBe(88);
    });

    test('threshold scales with zoom', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const effectiveThreshold = SNAP_THRESHOLD / 2;
      const justOutside = 100 - effectiveThreshold - 1;
      const result = snapPosition(justOutside, 60, 50, 50, [other], 2);
      expect(result.x).toBe(justOutside);
    });

    test('snaps within zoom-adjusted threshold', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(99, 60, 50, 50, [other], 2);
      expect(result.x).toBe(100);
    });
  });

  describe('snap lines', () => {
    test('generates snap lines when snapped', () => {
      const other = makeShape({ id: 'other', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(98, 0, 50, 50, [other], 1);
      expect(result.snapLines.length).toBeGreaterThan(0);
      expect(result.snapLines[0]!.axis).toBe('x');
    });

    test('generates no snap lines when not snapped', () => {
      const other = makeShape({ id: 'other', x: 200, y: 200, width: 50, height: 50 });
      const result = snapPosition(0, 0, 50, 50, [other], 1);
      expect(result.snapLines.length).toBe(0);
    });
  });

  describe('guides', () => {
    test('snaps to vertical guide', () => {
      const result = snapPosition(98, 0, 50, 50, [], 1, undefined, [{ axis: 'x', position: 100 }]);
      expect(result.x).toBe(100);
    });

    test('snaps to horizontal guide', () => {
      const result = snapPosition(0, 198, 50, 50, [], 1, undefined, [{ axis: 'y', position: 200 }]);
      expect(result.y).toBe(200);
    });
  });

  describe('parent frame', () => {
    test('snaps to parent frame padding edges', () => {
      const parentFrame = {
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        paddingTop: 20,
        paddingRight: 20,
        paddingBottom: 20,
        paddingLeft: 20,
      };
      const result = snapPosition(18, 0, 50, 50, [], 1, parentFrame);
      expect(result.x).toBe(20);
    });
  });

  describe('equal spacing', () => {
    test('snaps to equal spacing between shapes', () => {
      const a = makeShape({ id: 'a', x: 0, y: 0, width: 50, height: 50 });
      const b = makeShape({ id: 'b', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(198, 0, 50, 50, [a, b], 1);
      expect(result.x).toBe(200);
    });

    test('includes distance indicator for equal spacing', () => {
      const a = makeShape({ id: 'a', x: 0, y: 0, width: 50, height: 50 });
      const b = makeShape({ id: 'b', x: 100, y: 0, width: 50, height: 50 });
      const result = snapPosition(198, 0, 50, 50, [a, b], 1);
      expect(result.distanceIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('multiple shapes', () => {
    test('snaps to closest matching edge', () => {
      const a = makeShape({ id: 'a', x: 97, y: 200, width: 50, height: 50 });
      const b = makeShape({ id: 'b', x: 100, y: 200, width: 50, height: 50 });
      const result = snapPosition(99, 0, 50, 50, [a, b], 1);
      expect(result.x).toBe(100);
    });
  });
});
