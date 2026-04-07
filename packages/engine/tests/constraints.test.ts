import { describe, test, expect } from 'bun:test';
import { applyConstraints, type Constraints } from '../src/constraints';

const parentOld = { width: 400, height: 300 };

function apply(
  child: { x: number; y: number; width: number; height: number },
  constraints: Constraints,
  parentNew: { width: number; height: number },
) {
  return applyConstraints(child, constraints, parentOld, parentNew, { ...child });
}

describe('applyConstraints', () => {
  describe('horizontal', () => {
    test('left: position unchanged', () => {
      const result = apply(
        { x: 20, y: 10, width: 100, height: 50 },
        { horizontal: 'left', vertical: 'top' },
        { width: 500, height: 300 },
      );
      expect(result.x).toBe(20);
      expect(result.width).toBe(100);
    });

    test('right: position shifts by parent width delta', () => {
      const result = apply(
        { x: 20, y: 10, width: 100, height: 50 },
        { horizontal: 'right', vertical: 'top' },
        { width: 500, height: 300 },
      );
      expect(result.x).toBe(120);
      expect(result.width).toBe(100);
    });

    test('left-right: width stretches with parent', () => {
      const result = apply(
        { x: 20, y: 10, width: 100, height: 50 },
        { horizontal: 'left-right', vertical: 'top' },
        { width: 500, height: 300 },
      );
      expect(result.x).toBe(20);
      expect(result.width).toBe(200);
    });

    test('center: position shifts by half parent delta', () => {
      const result = apply(
        { x: 150, y: 10, width: 100, height: 50 },
        { horizontal: 'center', vertical: 'top' },
        { width: 500, height: 300 },
      );
      expect(result.x).toBe(200);
    });

    test('scale: position and width scale proportionally', () => {
      const result = apply(
        { x: 100, y: 10, width: 200, height: 50 },
        { horizontal: 'scale', vertical: 'top' },
        { width: 800, height: 300 },
      );
      expect(result.x).toBe(200);
      expect(result.width).toBe(400);
    });
  });

  describe('vertical', () => {
    test('top: position unchanged', () => {
      const result = apply(
        { x: 0, y: 20, width: 100, height: 50 },
        { horizontal: 'left', vertical: 'top' },
        { width: 400, height: 400 },
      );
      expect(result.y).toBe(20);
      expect(result.height).toBe(50);
    });

    test('bottom: position shifts by parent height delta', () => {
      const result = apply(
        { x: 0, y: 20, width: 100, height: 50 },
        { horizontal: 'left', vertical: 'bottom' },
        { width: 400, height: 400 },
      );
      expect(result.y).toBe(120);
      expect(result.height).toBe(50);
    });

    test('top-bottom: height stretches with parent', () => {
      const result = apply(
        { x: 0, y: 20, width: 100, height: 50 },
        { horizontal: 'left', vertical: 'top-bottom' },
        { width: 400, height: 400 },
      );
      expect(result.y).toBe(20);
      expect(result.height).toBe(150);
    });

    test('center: position shifts by half parent delta', () => {
      const result = apply(
        { x: 0, y: 100, width: 100, height: 50 },
        { horizontal: 'left', vertical: 'center' },
        { width: 400, height: 400 },
      );
      expect(result.y).toBe(150);
    });

    test('scale: position and height scale proportionally', () => {
      const result = apply(
        { x: 0, y: 60, width: 100, height: 120 },
        { horizontal: 'left', vertical: 'scale' },
        { width: 400, height: 600 },
      );
      expect(result.y).toBe(120);
      expect(result.height).toBe(240);
    });
  });

  describe('minimum size', () => {
    test('width never goes below 1', () => {
      const result = apply(
        { x: 0, y: 0, width: 10, height: 50 },
        { horizontal: 'left-right', vertical: 'top' },
        { width: 380, height: 300 },
      );
      expect(result.width).toBeGreaterThanOrEqual(1);
    });

    test('height never goes below 1', () => {
      const result = apply(
        { x: 0, y: 0, width: 100, height: 10 },
        { horizontal: 'left', vertical: 'top-bottom' },
        { width: 400, height: 280 },
      );
      expect(result.height).toBeGreaterThanOrEqual(1);
    });
  });
});
