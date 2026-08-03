import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import {
  draftId,
  draftAndShape,
  draftAndShapes,
  defineTool,
  SHAPE_TYPES,
  SHAPE_TYPE_DOC,
  CREATE_PROPS_DOC,
  UPDATE_PROPS_DOC,
} from './schemas';

export function registerShapeTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'create_shape',
    'Create a new shape on the active page. This is the RECOMMENDED way to build designs — create shapes one at a time so the user can see real-time progress. Use create_shape for each element in your design (frames, text, rectangles, etc.). For small groups of tightly related shapes (e.g. a button with an icon and label), you may use batch_create_shapes, but do NOT use batch_create_shapes for entire designs or large sections. Shapes are always created on the active page — use set_active_page first if needed. IMPORTANT: Shapes render in creation order (last created = on top). Create background shapes first, then foreground elements (e.g. background rectangle before text on top of it). Use move_in_stack to fix z-order after the fact. TIP: For containers that auto-position children (no manual x/y needed), set layoutMode on frames — see props description for details.',
    {
      ...draftId,
      type: z.enum(SHAPE_TYPES).describe(SHAPE_TYPE_DOC),
      childIndex: z
        .number()
        .optional()
        .describe(
          'Insert position among siblings (0 = first child, 1 = second, etc.). Only applies when parentId is set. Omit to append as last child.',
        ),
      props: z.record(z.unknown()).optional().describe(CREATE_PROPS_DOC),
    },
    async ({ draftId, type, props, childIndex }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_shape', {
        type,
        props,
        childIndex,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'get_shape',
    'Get a shape by ID with all its properties. For children inside a frame, x/y are relative to the parent frame.',
    draftAndShape,
    async ({ draftId, shapeId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'get_shape', { shapeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'update_shape',
    'Update shape properties (position, size, fills, strokes, text, etc.)',
    {
      ...draftAndShape,
      props: z.record(z.unknown()).describe(UPDATE_PROPS_DOC),
    },
    async ({ draftId, shapeId, props }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'update_shape', {
        shapeId,
        props,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'delete_shapes',
    'Delete one or more shapes. Returns { deletedIds: string[] } with the IDs of deleted shapes.',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'delete_shapes', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'list_shapes',
    'List all shapes on the active page (or children of a specific parent). Returns full shape objects with all properties (type, x, y, width, height, fills, etc.) — use this to inspect layout and debug positioning. Returns only shapes on the currently active page — use set_active_page to switch pages first if needed. If you get 0 shapes, check which page is active with list_pages.',
    {
      ...draftId,
      parentId: z.string().optional().describe('Filter to children of this parent shape'),
      recursive: z
        .boolean()
        .optional()
        .describe(
          'When true, returns a tree with nested children arrays instead of a flat list. Useful for understanding the full hierarchy in one call.',
        ),
      compact: z
        .boolean()
        .optional()
        .describe(
          'When true, returns only essential properties (id, type, name, x, y, width, height, parentId) instead of all shape properties. Much smaller output — use this for large designs to avoid token overflow.',
        ),
    },
    async ({ draftId, parentId, recursive, compact }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_shapes', {
        parentId,
        recursive,
        compact,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'duplicate_shapes',
    'Duplicate shapes in place, returns mapping of old IDs to new IDs',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'duplicate_shapes', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
