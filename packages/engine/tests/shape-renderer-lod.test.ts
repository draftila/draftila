import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import {
  simplifyShapeForZoom,
  textLegibilityForVisibleShapes,
  LOD_TEXT_LEGIBILITY_PX,
  LOD_DETAIL_ZOOM,
  LOD_TEXT_TIERS,
} from '../src/shape-renderer';

function shape(props: Record<string, unknown>): Shape {
  return {
    id: 'shape',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: 'shape',
    fills: [{ color: '#ffffff', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
    ...props,
  } as unknown as Shape;
}

function strokesOf(result: Shape): unknown[] | undefined {
  return (result as Shape & { strokes?: unknown[] }).strokes;
}

describe('simplifyShapeForZoom', () => {
  test('returns shapes unchanged at full zoom', () => {
    const original = shape({ shadows: [{ color: '#000', blur: 4 }] });
    expect(simplifyShapeForZoom(original, 1)).toBe(original);
  });

  test('replaces text with a block below the legibility threshold', () => {
    const text = shape({ type: 'text', fontSize: 16, content: 'hello', svgPathData: 'M0 0' });
    const zoom = (LOD_TEXT_LEGIBILITY_PX - 1) / 16;
    const result = simplifyShapeForZoom(text, zoom);

    expect(result.type).toBe('rectangle');
    expect((result as Shape & { svgPathData?: string }).svgPathData).toBeUndefined();
    expect(result.opacity).toBeLessThan(1);
  });

  test('keeps text as text at or above the legibility threshold', () => {
    const text = shape({ type: 'text', fontSize: 16, content: 'hello' });
    const zoom = (LOD_TEXT_LEGIBILITY_PX + 1) / 16;
    expect(simplifyShapeForZoom(text, zoom).type).toBe('text');
  });

  test('strips shadows and blurs below the detail zoom', () => {
    const decorated = shape({ shadows: [{ color: '#000', blur: 4 }], blurs: [{ radius: 2 }] });
    const result = simplifyShapeForZoom(decorated, LOD_DETAIL_ZOOM - 0.1);

    expect((result as Shape & { shadows?: unknown[] }).shadows).toEqual([]);
    expect((result as Shape & { blurs?: unknown[] }).blurs).toEqual([]);
  });

  test('strips strokes from a filled shape below the detail zoom', () => {
    const filled = shape({ strokes: [{ color: '#000', width: 1, visible: true }] });
    expect(strokesOf(simplifyShapeForZoom(filled, 0.1))).toEqual([]);
  });

  test('keeps strokes on a line, which renders only through them', () => {
    const line = shape({
      type: 'line',
      fills: [],
      strokes: [{ color: '#000', width: 2, visible: true }],
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
    });
    expect(strokesOf(simplifyShapeForZoom(line, 0.1))).toHaveLength(1);
  });

  test('keeps strokes on an outline-only shape with no visible fill', () => {
    const outline = shape({
      fills: [{ color: '#ffffff', opacity: 1, visible: false }],
      strokes: [{ color: '#000', width: 1, visible: true }],
    });
    expect(strokesOf(simplifyShapeForZoom(outline, 0.1))).toHaveLength(1);
  });

  test('keeps strokes on a shape with no fills array at all', () => {
    const unfilled = shape({ fills: undefined, strokes: [{ color: '#000', width: 1 }] });
    expect(strokesOf(simplifyShapeForZoom(unfilled, 0.1))).toHaveLength(1);
  });

  test('honours a caller-supplied legibility threshold over the default', () => {
    const text = shape({ type: 'text', fontSize: 16, content: 'hello' });
    const zoom = 4.5 / 16;

    expect(simplifyShapeForZoom(text, zoom, 4).type).toBe('text');
    expect(simplifyShapeForZoom(text, zoom, 5).type).toBe('rectangle');
  });
});

describe('textLegibilityForVisibleShapes', () => {
  const sparse = LOD_TEXT_TIERS[0]!;
  const light = LOD_TEXT_TIERS[1]!;
  const dense = LOD_TEXT_TIERS[2]!;

  test('keeps text sharpest when few layers are in view', () => {
    expect(textLegibilityForVisibleShapes(0)).toBe(sparse.legibilityPx);
    expect(textLegibilityForVisibleShapes(sparse.maxVisibleShapes)).toBe(sparse.legibilityPx);
  });

  test('blurs earlier as more layers come into view', () => {
    expect(textLegibilityForVisibleShapes(light.maxVisibleShapes)).toBe(light.legibilityPx);
    expect(textLegibilityForVisibleShapes(light.maxVisibleShapes + 1)).toBe(dense.legibilityPx);
  });

  test('every tier is reachable at the raster scales frames are baked at', () => {
    const bakedGlyphPx = (bucket: number) => 16 * bucket;
    const sharpAt = (legibilityPx: number, bucket: number) => bakedGlyphPx(bucket) >= legibilityPx;

    expect(sharpAt(sparse.legibilityPx, 0.125)).toBe(true);
    expect(sharpAt(light.legibilityPx, 0.125)).toBe(false);
    expect(sharpAt(light.legibilityPx, 0.25)).toBe(true);
    expect(sharpAt(dense.legibilityPx, 0.25)).toBe(false);
  });

  test('holds the current tier just past a boundary rather than flapping', () => {
    const justOver = sparse.maxVisibleShapes + 1;
    expect(textLegibilityForVisibleShapes(justOver, sparse.legibilityPx)).toBe(sparse.legibilityPx);
    expect(textLegibilityForVisibleShapes(justOver, light.legibilityPx)).toBe(light.legibilityPx);
  });

  test('moves up a tier once the count clears the hysteresis band', () => {
    const wellOver = sparse.maxVisibleShapes * 1.3;
    expect(textLegibilityForVisibleShapes(wellOver, sparse.legibilityPx)).toBe(light.legibilityPx);
  });

  test('moves back down only once the count drops clear of the boundary', () => {
    const justUnder = sparse.maxVisibleShapes - 1;
    expect(textLegibilityForVisibleShapes(justUnder, light.legibilityPx)).toBe(light.legibilityPx);

    const wellUnder = sparse.maxVisibleShapes * 0.7;
    expect(textLegibilityForVisibleShapes(wellUnder, light.legibilityPx)).toBe(sparse.legibilityPx);
  });

  test('jumps straight to the right tier when the count changes sharply', () => {
    expect(textLegibilityForVisibleShapes(50_000, sparse.legibilityPx)).toBe(dense.legibilityPx);
  });

  test('falls back to the natural tier when the current value is not a tier', () => {
    expect(textLegibilityForVisibleShapes(0, 0)).toBe(sparse.legibilityPx);
  });
});
