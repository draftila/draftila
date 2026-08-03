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
