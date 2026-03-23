import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerBatchTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'batch_create_shapes',
    'Create multiple shapes in a single call. Shapes are created in order, so later shapes can reference earlier shapes as parents using the placeholder syntax: use "$0", "$1", etc. to reference the ID of the shape created at that index. Returns array of created shape IDs. Requires the editor to be open in the browser.',
    {
      ...draftId,
      shapes: z
        .array(
          z.object({
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
                'Shape properties: x, y, width, height, rotation, name, opacity, parentId (use "$0", "$1" etc. to reference shapes created earlier in this batch), fills (array of {color, opacity?, visible?}), strokes (array of {color, width}), cornerRadius (uniform), cornerRadiusTL, cornerRadiusTR, cornerRadiusBL, cornerRadiusBR (per-corner overrides), cornerSmoothing (0-1). Text shapes: content (the text string), fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform. Frame auto-layout: layoutMode ("horizontal"|"vertical"), layoutGap, paddingTop, paddingRight, paddingBottom, paddingLeft, layoutAlign ("start"|"center"|"end"|"stretch"), layoutJustify ("start"|"center"|"end"|"space_between")',
              ),
          }),
        )
        .describe('Array of shapes to create, in order'),
    },
    async ({ draftId, shapes }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'batch_create_shapes', {
        shapes,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'batch_update_shapes',
    'Update multiple shapes in a single call. More efficient than calling update_shape multiple times.',
    {
      ...draftId,
      updates: z
        .array(
          z.object({
            shapeId: z.string().describe('Shape ID to update'),
            props: z
              .record(z.unknown())
              .describe(
                'Properties to update: x, y, width, height, rotation, name, opacity, fills, strokes, cornerRadius, cornerRadiusTL, cornerRadiusTR, cornerRadiusBL, cornerRadiusBR, cornerSmoothing, visible, locked, parentId. Text: content, fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform. Frame auto-layout: layoutMode, layoutGap, paddingTop, paddingRight, paddingBottom, paddingLeft, layoutAlign, layoutJustify, layoutSizingHorizontal, layoutSizingVertical',
              ),
          }),
        )
        .describe('Array of shape updates'),
    },
    async ({ draftId, updates }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'batch_update_shapes', {
        updates,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
