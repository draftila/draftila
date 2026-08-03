import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getShape, initDocument } from '../src/scene-graph';
import { ensureDefaultPage } from '../src/pages';
import { createRpcHandlers } from '../src/rpc-handlers';

function newDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
  return ydoc;
}

const handlers = createRpcHandlers();

async function createShape(
  ydoc: Y.Doc,
  type: string,
  props: Record<string, unknown>,
): Promise<string> {
  const result = (await handlers['create_shape']!(ydoc, { type, props })) as { shapeId: string };
  return result.shapeId;
}

async function buildCard(
  ydoc: Y.Doc,
): Promise<{ frameId: string; titleId: string; bodyId: string }> {
  const frameId = await createShape(ydoc, 'frame', {
    x: 10,
    y: 20,
    width: 200,
    height: 120,
    name: 'Card',
  });
  const titleId = await createShape(ydoc, 'text', {
    x: 10,
    y: 10,
    parentId: frameId,
    content: 'Title',
  });
  const bodyId = await createShape(ydoc, 'text', {
    x: 10,
    y: 40,
    parentId: frameId,
    content: 'Body',
  });
  return { frameId, titleId, bodyId };
}

describe('create_component over RPC', () => {
  test('captures descendants when only the frame ID is passed', async () => {
    const ydoc = newDoc();
    const { frameId } = await buildCard(ydoc);

    const created = (await handlers['create_component']!(ydoc, {
      shapeIds: [frameId],
      name: 'Card',
    })) as { componentId: string };

    const listed = (await handlers['list_components']!(ydoc, {})) as {
      components: { id: string; shapes: Shape[] }[];
    };
    const component = listed.components.find((c) => c.id === created.componentId);

    expect(component?.shapes).toHaveLength(3);
    expect(component?.shapes.map((s) => s.type).sort()).toEqual(['frame', 'text', 'text']);
  });

  test('an instance lands where it was asked to, with its nesting intact', async () => {
    const ydoc = newDoc();
    const { frameId } = await buildCard(ydoc);

    const created = (await handlers['create_component']!(ydoc, {
      shapeIds: [frameId],
      name: 'Card',
    })) as { componentId: string };
    const instance = (await handlers['create_instance']!(ydoc, {
      componentId: created.componentId,
      x: 500,
      y: 600,
    })) as { rootIds: string[] };

    expect(instance.rootIds).toHaveLength(1);
    const rootId = instance.rootIds[0]!;

    const root = getShape(ydoc, rootId);
    expect(root?.type).toBe('frame');
    expect(root?.parentId).toBeNull();
    expect(root?.x).toBe(500);
    expect(root?.y).toBe(600);

    const children = (await handlers['list_shapes']!(ydoc, { parentId: rootId })) as {
      shapes: Shape[];
    };
    expect(children.shapes).toHaveLength(2);
    const byContent = new Map(children.shapes.map((s) => [s.content, s]));
    expect(byContent.get('Title')).toMatchObject({ x: 10, y: 10 });
    expect(byContent.get('Body')).toMatchObject({ x: 10, y: 40 });
  });

  test('instances keep their nesting even when IDs arrive child-first', async () => {
    const ydoc = newDoc();
    const { frameId, titleId, bodyId } = await buildCard(ydoc);

    const created = (await handlers['create_component']!(ydoc, {
      shapeIds: [bodyId, titleId, frameId],
      name: 'Card',
    })) as { componentId: string };
    const instance = (await handlers['create_instance']!(ydoc, {
      componentId: created.componentId,
      x: 0,
      y: 0,
    })) as { rootIds: string[] };

    expect(instance.rootIds).toHaveLength(1);
    const children = (await handlers['list_shapes']!(ydoc, {
      parentId: instance.rootIds[0]!,
    })) as { shapes: Shape[] };
    expect(children.shapes).toHaveLength(2);
  });

  test('deleting the definition leaves already-stamped shapes on the canvas', async () => {
    const ydoc = newDoc();
    const { frameId } = await buildCard(ydoc);

    const created = (await handlers['create_component']!(ydoc, {
      shapeIds: [frameId],
      name: 'Card',
    })) as { componentId: string };
    const instance = (await handlers['create_instance']!(ydoc, {
      componentId: created.componentId,
      x: 0,
      y: 0,
    })) as { rootIds: string[] };

    await handlers['remove_component']!(ydoc, { componentId: created.componentId });

    expect(getShape(ydoc, instance.rootIds[0]!)).not.toBeNull();
  });
});
