import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndShape, draftAndShapes, defineTool } from './schemas';

export function registerShapeTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'create_shape',
    'Create a new shape on the canvas. Requires the editor to be open in the browser.',
    {
      ...draftId,
      type: z
        .enum([
          'rectangle',
          'ellipse',
          'frame',
          'text',
          'path',
          'line',
          'polygon',
          'star',
          'image',
          'svg',
        ])
        .describe('Shape type'),
      props: z
        .record(z.unknown())
        .optional()
        .describe(
          'Shape properties: x, y, width, height, rotation, name, opacity, fills (array of {color, opacity?, visible?}), strokes (array of {color, width}), cornerRadius, parentId (to nest inside a frame). Text shapes: content (the text string), fontSize (default 16), fontFamily (default Inter), fontWeight (default 400), fontStyle (normal|italic), textAlign (left|center|right), verticalAlign (top|middle|bottom), lineHeight (default 1.2), letterSpacing, textDecoration (none|underline|strikethrough), textTransform (none|uppercase|lowercase|capitalize)',
        ),
    },
    async ({ draftId, type, props }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_shape', {
        type,
        props,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'get_shape',
    'Get a shape by ID with all its properties',
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
      props: z
        .record(z.unknown())
        .describe(
          'Properties to update: x, y, width, height, rotation, name, opacity, fills, strokes, cornerRadius, visible, locked. Text shapes: content, fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform',
        ),
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
    'Delete one or more shapes',
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
    'List all shapes in a draft (or children of a specific parent)',
    {
      ...draftId,
      parentId: z.string().optional().describe('Filter to children of this parent shape'),
    },
    async ({ draftId, parentId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_shapes', { parentId });
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
