import { describe, test, expect } from 'bun:test';
import {
  computeResize,
  computeRotation,
  getSelectionBounds,
  normalizeRect,
} from '../src/selection-bounds';
import type { Shape } from '@draftila/shared';

function makeShape(overrides: Partial<Shape>): Shape {
  return {
    id: 'test',
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

describe('normalizeRect', () => {
  test('handles positive dimensions', () => {
    expect(normalizeRect(10, 20, 100, 50)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  test('flips negative width', () => {
    const result = normalizeRect(100, 20, -80, 50);
    expect(result.x).toBe(20);
    expect(result.width).toBe(80);
  });

  test('flips negative height', () => {
    const result = normalizeRect(10, 100, 80, -60);
    expect(result.y).toBe(40);
    expect(result.height).toBe(60);
  });
});

describe('computeResize', () => {
  const startBounds = { x: 0, y: 0, width: 100, height: 100 };

  test('bottom-right resize increases size', () => {
    const result = computeResize('bottom-right', startBounds, { x: 50, y: 30 }, false, false);
    expect(result.width).toBe(150);
    expect(result.height).toBe(130);
  });

  test('top-left resize moves origin', () => {
    const result = computeResize('top-left', startBounds, { x: -20, y: -10 }, false, false);
    expect(result.x).toBe(-20);
    expect(result.y).toBe(-10);
    expect(result.width).toBe(120);
    expect(result.height).toBe(110);
  });

  describe('aspect ratio lock (shift)', () => {
    test('maintains aspect ratio from bottom-right', () => {
      const result = computeResize(
        'bottom-right',
        { x: 0, y: 0, width: 200, height: 100 },
        { x: 100, y: 0 },
        true,
        false,
      );
      expect(result.width / result.height).toBeCloseTo(2, 5);
    });

    test('does not flip dimensions when dragging past origin', () => {
      const result = computeResize(
        'top-left',
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 150, y: 150 },
        true,
        false,
      );
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('alt key (center resize)', () => {
    test('expands from center', () => {
      const result = computeResize('bottom-right', startBounds, { x: 20, y: 20 }, false, true);
      expect(result.x).toBeLessThan(0);
      expect(result.width).toBeGreaterThan(100);
    });
  });
});

describe('computeRotation', () => {
  test('computes angle from center to current point', () => {
    const center = { x: 50, y: 50 };
    const angle = computeRotation(center, { x: 50, y: 0 }, false);
    expect(angle).toBeCloseTo(0, 0);
  });

  test('snaps to 15 degree increments with shift', () => {
    const center = { x: 50, y: 50 };
    const angle = computeRotation(center, { x: 60, y: 0 }, true);
    expect(angle % 15).toBe(0);
  });
});

describe('getSelectionBounds', () => {
  test('returns null for empty array', () => {
    expect(getSelectionBounds([])).toBeNull();
  });

  test('returns single shape bounds with rotation', () => {
    const shape = makeShape({ x: 10, y: 20, width: 100, height: 50, rotation: 45 });
    const bounds = getSelectionBounds([shape])!;
    expect(bounds.rotation).toBe(45);
    expect(bounds.x).toBe(10);
  });

  test('multi-selection has rotation 0', () => {
    const shapes = [
      makeShape({ id: 'a', x: 0, y: 0, width: 50, height: 50, rotation: 30 }),
      makeShape({ id: 'b', x: 100, y: 100, width: 50, height: 50, rotation: 60 }),
    ];
    const bounds = getSelectionBounds(shapes)!;
    expect(bounds.rotation).toBe(0);
    expect(bounds.width).toBeGreaterThan(150);
  });

  test('multi-selection accounts for rotated shape corners', () => {
    const unrotated = [
      makeShape({ id: 'a', x: 0, y: 0, width: 100, height: 10, rotation: 0 }),
      makeShape({ id: 'b', x: 200, y: 200, width: 20, height: 20, rotation: 0 }),
    ];
    const boundsUnrotated = getSelectionBounds(unrotated)!;

    const rotated = [
      makeShape({ id: 'a', x: 0, y: 0, width: 100, height: 10, rotation: 45 }),
      makeShape({ id: 'b', x: 200, y: 200, width: 20, height: 20, rotation: 0 }),
    ];
    const boundsRotated = getSelectionBounds(rotated)!;

    expect(boundsRotated.height).toBeGreaterThan(boundsUnrotated.height);
  });
});
