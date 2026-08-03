import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { Fill, Shape } from '@draftila/shared';
import { addShape, getShape, updateShape, initDocument } from '../src/scene-graph';
import { ensureDefaultPage } from '../src/pages';
import {
  buildVariableTable,
  createVariable,
  getResolvedShapes,
  normalizeVariableValue,
  resolveColorRef,
  resolveShapeColors,
  setVariable,
  stripShapeColorVars,
} from '../src/variables';
import {
  countVariableUsage,
  deleteVariable,
  detachVariableFromShape,
  forEachShapeAcrossPages,
} from '../src/variable-scan';

function newDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
  return ydoc;
}

describe('colorVar persistence', () => {
  // The single highest-risk detail: zod strips unknown keys, and
  // normalizeArrayItem runs on every write of fills/strokes/shadows/guides.
  test('survives a Yjs write/read round trip on every bound site', () => {
    const ydoc = newDoc();
    const id = addShape(ydoc, 'rectangle', {
      fills: [
        { color: '#FF0000', colorVar: 'v1', opacity: 1, visible: true },
        {
          color: '#00FF00',
          opacity: 1,
          visible: true,
          gradient: {
            type: 'linear',
            angle: 0,
            stops: [
              { color: '#111111', colorVar: 'v2', position: 0 },
              { color: '#222222', position: 1 },
            ],
          },
        },
      ],
      strokes: [{ color: '#0000FF', colorVar: 'v3', width: 2, opacity: 1, visible: true }],
      shadows: [{ type: 'drop', x: 0, y: 2, blur: 4, spread: 0, color: '#00000040', colorVar: 'v4', visible: true }],
    } as Partial<Shape>);

    const shape = getShape(ydoc, id) as Shape & { fills: Fill[]; strokes: unknown[]; shadows: unknown[] };
    expect(shape.fills[0]!.colorVar).toBe('v1');
    expect(shape.fills[1]!.gradient!.stops[0]!.colorVar).toBe('v2');
    expect((shape.strokes[0] as { colorVar?: string }).colorVar).toBe('v3');
    expect((shape.shadows[0] as { colorVar?: string }).colorVar).toBe('v4');
  });

  test('a colorVar-only fill keeps its zod defaults', () => {
    const ydoc = newDoc();
    // Reaches the doc via MCP create_shape; before the refine was relaxed this
    // failed validation, fell through unnormalized, and lost `visible`.
    const id = addShape(ydoc, 'rectangle', {
      fills: [{ colorVar: 'v1' }],
    } as unknown as Partial<Shape>);

    const fill = (getShape(ydoc, id) as Shape & { fills: Fill[] }).fills[0]!;
    expect(fill.colorVar).toBe('v1');
    expect(fill.visible).toBe(true);
    expect(fill.opacity).toBe(1);
  });

  test('unbinding by omission actually removes the key', () => {
    const ydoc = newDoc();
    const id = addShape(ydoc, 'rectangle', {
      fills: [{ color: '#FF0000', colorVar: 'v1', opacity: 1, visible: true }],
    } as Partial<Shape>);

    const fill = (getShape(ydoc, id) as Shape & { fills: Fill[] }).fills[0]!;
    const { colorVar: _drop, ...rest } = fill;
    updateShape(ydoc, id, { fills: [{ ...rest, color: '#123456' }] } as Partial<Shape>);

    const after = (getShape(ydoc, id) as Shape & { fills: Fill[] }).fills[0]!;
    expect('colorVar' in after).toBe(false);
    expect(after.color).toBe('#123456');
  });
});

describe('resolveColorRef', () => {
  const table = new Map([['v1', '#FF0000']]);

  test('substitutes RGB and preserves local alpha', () => {
    // Shadows and guides bake opacity into the hex, so dropping it would
    // silently disable their opacity controls.
    expect(resolveColorRef('#00000040', 'v1', table)).toBe('#FF000040');
    expect(resolveColorRef('#000000', 'v1', table)).toBe('#FF0000');
  });

  test('falls back to the literal when the variable is missing', () => {
    expect(resolveColorRef('#00FF00', 'gone', table)).toBe('#00FF00');
    expect(resolveColorRef(undefined, 'gone', table)).toBeUndefined();
  });

  test('leaves unbound colors alone', () => {
    expect(resolveColorRef('#ABCDEF', undefined, table)).toBe('#ABCDEF');
  });

  test('7-digit hex is not mistaken for an alpha channel', () => {
    // colorSchema admits {6,8}, so length must be tested explicitly.
    expect(resolveColorRef('#0000000', 'v1', table)).toBe('#FF0000');
  });
});

describe('normalizeVariableValue', () => {
  test('accepts 6-digit, clamps 8-digit, expands 3-digit, rejects junk', () => {
    // Values arrive over the collaboration websocket unvalidated, and
    // setVariable shipped without validation, so drafts already hold these.
    expect(normalizeVariableValue('#6c3ce9')).toBe('#6C3CE9');
    expect(normalizeVariableValue('#11223344')).toBe('#112233');
    expect(normalizeVariableValue('#abc')).toBe('#AABBCC');
    expect(normalizeVariableValue('red')).toBeNull();
    expect(normalizeVariableValue('#000"/><script>')).toBeNull();
    expect(normalizeVariableValue(42)).toBeNull();
  });

  test('buildVariableTable drops values that would reach an SVG sink', () => {
    const ydoc = newDoc();
    setVariable(ydoc, 'ok', 'Ok', '#123456');
    // Bypass setVariable's own validation, as a remote peer would.
    const raw = new Y.Map<unknown>();
    raw.set('name', 'Bad');
    raw.set('type', 'color');
    raw.set('value', '#000"/><script>alert(1)</script>');
    (ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>).set('bad', raw);

    const table = buildVariableTable(ydoc);
    expect(table.get('ok')).toBe('#123456');
    expect(table.has('bad')).toBe(false);
  });
});

describe('shape resolution', () => {
  test('resolves fills, gradient stops, strokes and shadows', () => {
    const ydoc = newDoc();
    setVariable(ydoc, 'v1', 'Primary', '#FF0000');
    addShape(ydoc, 'rectangle', {
      fills: [{ color: '#000000', colorVar: 'v1', opacity: 1, visible: true }],
      shadows: [{ type: 'drop', x: 0, y: 2, blur: 4, spread: 0, color: '#00000040', colorVar: 'v1', visible: true }],
    } as Partial<Shape>);

    const [shape] = getResolvedShapes(ydoc) as Array<Shape & { fills: Fill[]; shadows: Array<{ color: string }> }>;
    expect(shape!.fills[0]!.color).toBe('#FF0000');
    expect(shape!.shadows[0]!.color).toBe('#FF000040');
  });

  test('returns the same reference when nothing is bound', () => {
    const table = new Map([['v1', '#FF0000']]);
    const shape = { id: 'a', type: 'rectangle', fills: [{ color: '#111111' }] } as unknown as Shape;
    expect(resolveShapeColors(table, shape)).toBe(shape);
  });

  test('stripShapeColorVars clears every nested binding', () => {
    const shape = {
      id: 'a',
      type: 'rectangle',
      fills: [
        { color: '#000000', colorVar: 'v1' },
        {
          color: '#111111',
          gradient: { type: 'linear', stops: [{ color: '#222222', colorVar: 'v2', position: 0 }] },
        },
      ],
      strokes: [{ color: '#333333', colorVar: 'v3' }],
    } as unknown as Shape;

    const stripped = stripShapeColorVars(shape) as unknown as {
      fills: Array<{ colorVar?: string; gradient?: { stops: Array<{ colorVar?: string }> } }>;
      strokes: Array<{ colorVar?: string }>;
    };
    expect('colorVar' in stripped.fills[0]!).toBe(false);
    expect('colorVar' in stripped.fills[1]!.gradient!.stops[0]!).toBe(false);
    expect('colorVar' in stripped.strokes[0]!).toBe(false);
  });
});

describe('cross-page walker', () => {
  test('reaches shapes on every page, not just the active one', () => {
    const ydoc = newDoc();
    const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
    // Second page, built directly — getShapesMap only ever sees the active one.
    const other = new Y.Map<unknown>();
    const otherShapes = new Y.Map<unknown>();
    const shapeMap = new Y.Map<unknown>();
    shapeMap.set('id', 's2');
    shapeMap.set('type', 'rectangle');
    const fills = new Y.Array<unknown>();
    const fill = new Y.Map<unknown>();
    fill.set('color', '#000000');
    fill.set('colorVar', 'v1');
    fills.push([fill]);
    shapeMap.set('fills', fills);
    otherShapes.set('s2', shapeMap);
    other.set('shapes', otherShapes);
    pages.set('page2', other);

    addShape(ydoc, 'rectangle', {
      fills: [{ color: '#000000', colorVar: 'v1', opacity: 1, visible: true }],
    } as Partial<Shape>);

    expect(countVariableUsage(ydoc, 'v1')).toBe(2);

    let seen = 0;
    forEachShapeAcrossPages(ydoc, () => {
      seen++;
      return null;
    });
    expect(seen).toBe(2);
  });

  test('detaching only rewrites the arrays that referenced the variable', () => {
    // Each written key rebuilds a whole Y.Array and resolves last-writer-wins,
    // so rewriting an untouched array would let a delete clobber a
    // collaborator's concurrent edit to it.
    const table = new Map([['v1', '#FF0000']]);
    const shape = {
      id: 's1',
      type: 'rectangle',
      fills: [{ color: '#0000FF', colorVar: 'v1' }],
      strokes: [{ color: '#00FF00' }],
      shadows: [{ color: '#111111', colorVar: 'other' }],
    } as unknown as Shape;

    const patch = detachVariableFromShape(shape, 'v1', table)!;
    expect(Object.keys(patch)).toEqual(['fills']);
    expect((patch.fills as Array<{ color: string }>)[0]!.color).toBe('#FF0000');
  });

  test('deleting a global inlines its value first, so nothing changes visually', () => {
    const ydoc = newDoc();
    const variable = createVariable(ydoc, 'Primary', '#FF0000');
    const id = addShape(ydoc, 'rectangle', {
      // Bind-time literal differs from the current value: a plain delete would
      // snap the shape back to blue.
      fills: [{ color: '#0000FF', colorVar: variable.id, opacity: 1, visible: true }],
    } as Partial<Shape>);

    expect(deleteVariable(ydoc, variable.id)).toBe(true);

    const fill = (getShape(ydoc, id) as Shape & { fills: Fill[] }).fills[0]!;
    expect(fill.color).toBe('#FF0000');
    expect('colorVar' in fill).toBe(false);
  });
});
