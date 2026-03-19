import { describe, expect, test } from 'bun:test';
import { getPathBounds, rectToPath } from '../src/path-gen';
import { PATH_AFFECTING_KEYS, computeSvgPathForShape } from '../src/scene-graph/shape-defaults';

describe('rectToPath corner smoothing', () => {
  test('keeps arc corners when smoothing is zero', () => {
    const path = rectToPath(120, 80, 20, 0);
    expect(path.includes('A20 20')).toBe(true);
    expect(path.includes('C')).toBe(false);
  });

  test('uses cubic corners when smoothing is full', () => {
    const path = rectToPath(120, 80, 20, 1);
    expect(path.includes('C')).toBe(true);
    expect(path.includes('A')).toBe(false);
  });

  test('normalizes large radii to avoid invalid geometry', () => {
    const path = rectToPath(20, 20, [15, 15, 15, 15], 1);
    const bounds = getPathBounds(path);

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.width).toBeCloseTo(20, 2);
    expect(bounds.height).toBeCloseTo(20, 2);
  });

  test('applies per-corner radii with smoothing', () => {
    const path = rectToPath(100, 80, [4, 8, 12, 16], 1);
    expect(path.startsWith('M4 0H92')).toBe(true);
    expect(path.includes('V68')).toBe(true);
  });
});

describe('rectangle path integration', () => {
  test('computeSvgPathForShape forwards cornerSmoothing', () => {
    const path = computeSvgPathForShape('rectangle', {
      width: 100,
      height: 100,
      cornerRadius: 20,
      cornerSmoothing: 1,
    });

    expect(path).toBeDefined();
    expect(path?.includes('C')).toBe(true);
  });

  test('cornerSmoothing is path-affecting', () => {
    expect(PATH_AFFECTING_KEYS.has('cornerSmoothing')).toBe(true);
  });
});
