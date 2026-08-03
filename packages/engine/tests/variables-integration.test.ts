import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { addShape, initDocument } from '../src/scene-graph';
import { ensureDefaultPage, getPageBackgroundColor, setPageBackgroundColorVar } from '../src/pages';
import { createVariable, getResolvedPageBackgroundColor, setVariableValue } from '../src/variables';
import { createRpcHandlers } from '../src/rpc-handlers';

function newDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
  return ydoc;
}

const handlers = createRpcHandlers();

describe('export paths resolve bindings end to end', () => {
  test('SVG and CSS export the global value, and follow it when it changes', async () => {
    const ydoc = newDoc();
    const primary = createVariable(ydoc, 'Primary', '#FF0000');
    addShape(ydoc, 'rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      // The literal is deliberately a different colour: if any export path
      // reads it instead of resolving, these assertions catch it.
      fills: [{ color: '#0000FF', colorVar: primary.id, opacity: 1, visible: true }],
    } as Partial<Shape>);

    const svg = (await handlers['export_svg']!(ydoc, {})) as string;
    expect(svg).toContain('#FF0000');
    expect(svg).not.toContain('#0000FF');

    const css = (await handlers['export_css']!(ydoc, {})) as string;
    expect(css.toUpperCase()).toContain('#FF0000');
    expect(css.toUpperCase()).not.toContain('#0000FF');

    setVariableValue(ydoc, primary.id, '#00FF00');

    const svgAfter = (await handlers['export_svg']!(ydoc, {})) as string;
    expect(svgAfter).toContain('#00FF00');
    expect(svgAfter).not.toContain('#FF0000');
  });

  test('a dangling reference exports the literal fallback rather than failing', async () => {
    const ydoc = newDoc();
    addShape(ydoc, 'rectangle', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fills: [{ color: '#ABCDEF', colorVar: 'never-existed', opacity: 1, visible: true }],
    } as Partial<Shape>);

    const svg = (await handlers['export_svg']!(ydoc, {})) as string;
    expect(svg).toContain('#ABCDEF');
  });

  test('list_shapes returns raw bindings so agents can see and edit them', async () => {
    const ydoc = newDoc();
    const primary = createVariable(ydoc, 'Primary', '#FF0000');
    addShape(ydoc, 'rectangle', {
      fills: [{ color: '#0000FF', colorVar: primary.id, opacity: 1, visible: true }],
    } as Partial<Shape>);

    const result = (await handlers['list_shapes']!(ydoc, {})) as {
      shapes: Array<{ fills: Array<{ color: string; colorVar?: string }> }>;
    };
    const fill = result.shapes[0]!.fills[0]!;
    expect(fill.colorVar).toBe(primary.id);
    expect(fill.color).toBe('#0000FF');
  });

  test('set_variable reports an overwrite so an agent cannot clobber silently', async () => {
    const ydoc = newDoc();
    await handlers['set_variable']!(ydoc, { id: 'primary', name: 'Primary', value: '#FF0000' });
    addShape(ydoc, 'rectangle', {
      fills: [{ color: '#FF0000', colorVar: 'primary', opacity: 1, visible: true }],
    } as Partial<Shape>);

    const result = (await handlers['set_variable']!(ydoc, {
      id: 'primary',
      name: 'Brand',
      value: '#00FF00',
    })) as { overwrote: boolean; usageCount: number; previousValue: string };

    expect(result.overwrote).toBe(true);
    expect(result.usageCount).toBe(1);
    expect(result.previousValue).toBe('#FF0000');
  });

  test('malformed colorVar from an agent is dropped before it reaches the document', async () => {
    const ydoc = newDoc();
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: {
        width: 10,
        height: 10,
        fills: [{ color: '#FF0000', colorVar: { evil: true }, opacity: 1, visible: true }],
      },
    })) as { shapeId: string };

    const result = (await handlers['get_shape']!(ydoc, { shapeId })) as {
      fills: Array<{ colorVar?: unknown }>;
    };
    expect('colorVar' in result.fills[0]!).toBe(false);
  });
});

describe('page background binding', () => {
  test('resolves through the variable and falls back when it is gone', () => {
    const ydoc = newDoc();
    const pageId = ensureDefaultPage(ydoc);
    const bg = createVariable(ydoc, 'Canvas', '#101010');

    setPageBackgroundColorVar(ydoc, pageId, bg.id);
    expect(getResolvedPageBackgroundColor(ydoc, pageId)).toBe('#101010');

    setVariableValue(ydoc, bg.id, '#202020');
    expect(getResolvedPageBackgroundColor(ydoc, pageId)).toBe('#202020');

    // Unbinding must delete the key, not set it undefined.
    setPageBackgroundColorVar(ydoc, pageId, null);
    expect(getResolvedPageBackgroundColor(ydoc, pageId)).toBe(getPageBackgroundColor(ydoc, pageId));
  });
});

describe('bind_variable / unbind_variable', () => {
  test('binds a fill without disturbing sibling items', async () => {
    const ydoc = newDoc();
    const primary = createVariable(ydoc, 'Primary', '#FF0000');
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: {
        width: 10,
        height: 10,
        fills: [
          { color: '#0000FF', opacity: 1, visible: true },
          { color: '#00FF00', opacity: 0.5, visible: true },
        ],
      },
    })) as { shapeId: string };

    const result = (await handlers['bind_variable']!(ydoc, {
      shapeId,
      target: 'fill',
      index: 0,
      variableId: primary.id,
    })) as { ok: boolean; resolvedColor?: string };

    expect(result.ok).toBe(true);
    expect(result.resolvedColor).toBe('#FF0000');

    const shape = (await handlers['get_shape']!(ydoc, { shapeId })) as {
      fills: Array<{ color: string; colorVar?: string; opacity: number }>;
    };
    expect(shape.fills[0]!.colorVar).toBe(primary.id);
    // The untouched sibling must keep its own values — a whole-array rewrite
    // would renormalise it.
    expect(shape.fills[1]!.colorVar).toBeUndefined();
    expect(shape.fills[1]!.opacity).toBe(0.5);
    expect(shape.fills[1]!.color).toBe('#00FF00');
  });

  test('rejects an unknown global rather than writing a dead binding', async () => {
    const ydoc = newDoc();
    createVariable(ydoc, 'Primary', '#FF0000');
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: { width: 10, height: 10, fills: [{ color: '#0000FF', opacity: 1, visible: true }] },
    })) as { shapeId: string };

    const result = (await handlers['bind_variable']!(ydoc, {
      shapeId,
      target: 'fill',
      variableId: 'does-not-exist',
    })) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toContain('does-not-exist');

    const shape = (await handlers['get_shape']!(ydoc, { shapeId })) as {
      fills: Array<{ colorVar?: string }>;
    };
    expect(shape.fills[0]!.colorVar).toBeUndefined();
  });

  test('rejects a gradient fill and points at the stop-level route', async () => {
    const ydoc = newDoc();
    const primary = createVariable(ydoc, 'Primary', '#FF0000');
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: {
        width: 10,
        height: 10,
        fills: [
          {
            color: '#000000',
            opacity: 1,
            visible: true,
            gradient: {
              type: 'linear',
              angle: 0,
              stops: [
                { color: '#111111', position: 0 },
                { color: '#222222', position: 1 },
              ],
            },
          },
        ],
      },
    })) as { shapeId: string };

    const result = (await handlers['bind_variable']!(ydoc, {
      shapeId,
      target: 'fill',
      variableId: primary.id,
    })) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toContain('gradient');
  });

  test('unbind keeps the colour the shape currently shows', async () => {
    const ydoc = newDoc();
    const primary = createVariable(ydoc, 'Primary', '#FF0000');
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: {
        width: 10,
        height: 10,
        // Bind-time literal deliberately differs from the global's value.
        fills: [{ color: '#0000FF', colorVar: primary.id, opacity: 1, visible: true }],
      },
    })) as { shapeId: string };

    await handlers['unbind_variable']!(ydoc, { shapeId, target: 'fill' });

    const shape = (await handlers['get_shape']!(ydoc, { shapeId })) as {
      fills: Array<{ color: string; colorVar?: string }>;
    };
    expect(shape.fills[0]!.color).toBe('#FF0000');
    expect(shape.fills[0]!.colorVar).toBeUndefined();
  });

  test('list_variables returns the shapes using a global', async () => {
    const ydoc = newDoc();
    const primary = createVariable(ydoc, 'Primary', '#FF0000');
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: {
        width: 10,
        height: 10,
        fills: [{ color: '#FF0000', colorVar: primary.id, opacity: 1, visible: true }],
      },
    })) as { shapeId: string };

    const result = (await handlers['list_variables']!(ydoc, { variableId: primary.id })) as {
      variables: Array<{ id: string; shapeIds: string[] }>;
    };
    expect(result.variables).toHaveLength(1);
    expect(result.variables[0]!.shapeIds).toEqual([shapeId]);
  });
});

describe('batch tools', () => {
  test('strip malformed colorVar, like the single-shape tools', async () => {
    const ydoc = newDoc();
    const { shapeIds } = (await handlers['batch_create_shapes']!(ydoc, {
      shapes: [
        {
          type: 'rectangle',
          props: {
            width: 10,
            height: 10,
            fills: [{ color: '#FF0000', colorVar: { evil: true }, opacity: 1, visible: true }],
          },
        },
      ],
    })) as { shapeIds: string[] };

    const shape = (await handlers['get_shape']!(ydoc, { shapeId: shapeIds[0]! })) as {
      fills: Array<{ colorVar?: unknown }>;
    };
    expect('colorVar' in shape.fills[0]!).toBe(false);
  });
});

describe('shadows', () => {
  test('a shadow with no explicit type defaults to drop and survives', async () => {
    // Without the schema default this item failed validation, persisted raw,
    // and was filtered out by every renderer — invisible.
    const ydoc = newDoc();
    const { shapeId } = (await handlers['create_shape']!(ydoc, {
      type: 'rectangle',
      props: {
        width: 10,
        height: 10,
        shadows: [{ color: '#00000020', x: 0, y: 4, blur: 12 }],
      },
    })) as { shapeId: string };

    const shape = (await handlers['get_shape']!(ydoc, { shapeId })) as {
      shadows: Array<{ type: string; x: number; y: number; visible: boolean }>;
    };
    expect(shape.shadows[0]!.type).toBe('drop');
    expect(shape.shadows[0]!.y).toBe(4);
    expect(shape.shadows[0]!.visible).toBe(true);
  });
});
