import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import {
  simplifyShapeForZoom,
  LOD_TEXT_LEGIBILITY_PX,
  LOD_DETAIL_ZOOM,
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
});
