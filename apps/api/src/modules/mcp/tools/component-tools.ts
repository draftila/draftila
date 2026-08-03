import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndShapes, defineTool } from './schemas';

interface ComponentSummarySource {
  id: string;
  name: string;
  shapes?: { type: string; name?: string }[];
}

export function registerComponentTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'create_component',
    'Save a snapshot of existing shapes as a reusable component, so create_instance can stamp out copies of it (e.g. an icon+text row, an input field, a card template). Pass the top-level shape IDs — descendants are captured automatically, so a frame ID brings its whole subtree. The snapshot is frozen at this moment: later edits to the original shapes do not change the component, and there is no way to update a component in place — create a new one instead.',
    {
      ...draftAndShapes,
      name: z.string().describe('Component name'),
    },
    async ({ draftId, shapeIds, name }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_component', {
        shapeIds,
        name,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'create_instance',
    'Stamp out a copy of a component at a given position — use this to repeat a pattern (list items, cards, buttons) instead of recreating its shapes each time. The copy is INDEPENDENT: it gets fresh shape IDs and edits to it, or to the component, do not propagate either way. A record of which component it came from is kept, but there is no live link, no overrides and no detach. Returns { rootIds } — the new IDs of the top-level shapes, which you can then update_shape to customise (e.g. change the label text).',
    {
      ...draftId,
      componentId: z.string().describe('The component ID to instantiate'),
      x: z
        .number()
        .describe(
          "X position for the instance's top-left corner (the component's shapes are normalised to their bounding box, so this is where the whole instance starts). Relative to parentId when set.",
        ),
      y: z.number().describe("Y position for the instance's top-left corner"),
      parentId: z.string().optional().describe('Optional parent frame to place instance in'),
    },
    async ({ draftId, componentId, x, y, parentId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_instance', {
        componentId,
        x,
        y,
        parentId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'list_components',
    'List the reusable components in a draft, as { id, name, shapeCount, shapes: [{type, name}] }. Call this before building a repeated pattern — reusing an existing component with create_instance is cheaper and more consistent than recreating its shapes.',
    draftId,
    async ({ draftId }) => {
      const result = (await sendToolRpc(
        draftId as string,
        getUserId(),
        'list_components',
        {},
      )) as { components?: ComponentSummarySource[] };

      // The RPC returns each component's full shape JSON, which is far more
      // than an agent needs to choose one and dwarfs the rest of its context.
      const components = (result.components ?? []).map((component) => ({
        id: component.id,
        name: component.name,
        shapeCount: component.shapes?.length ?? 0,
        shapes: (component.shapes ?? []).map((shape) => ({
          type: shape.type,
          name: shape.name,
        })),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify({ components }) }] };
    },
  );

  defineTool(
    server,
    'remove_component',
    'Delete a component definition. Shapes already stamped out from it are unaffected — they stay on the canvas as ordinary shapes.',
    {
      ...draftId,
      componentId: z.string().describe('The component ID to remove'),
    },
    async ({ draftId, componentId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'remove_component', {
        componentId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
