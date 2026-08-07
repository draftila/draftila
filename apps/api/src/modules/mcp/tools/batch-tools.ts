import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import {
  draftId,
  defineTool,
  SHAPE_TYPES,
  SHAPE_TYPE_DOC,
  BATCH_CREATE_PROPS_DOC,
  UPDATE_PROPS_DOC,
} from './schemas';

export function registerBatchTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'batch_create_shapes',
    'Create multiple shapes in a single call. IMPORTANT: Only use this for small groups of tightly related shapes (e.g. a button with icon and label, a single card with 3-5 elements). Do NOT use this for entire designs, full sections, or large layouts — use create_shape one at a time instead so the user sees real-time feedback. Shapes are created in order; use "$0", "$1", etc. as parentId to reference shapes created earlier in the batch. Creation order = z-order. Create background shapes before foreground shapes. Example — auto-layout card: [{ type: "frame", props: { x: 0, y: 0, width: 320, layoutSizingVertical: "hug", layoutMode: "vertical", layoutGap: 12, paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, fills: [{color: "#ffffff"}], cornerRadius: 12, shadows: [{color: "#00000015", x: 0, y: 4, blur: 16}] } }, { type: "text", props: { parentId: "$0", content: "Title", fontSize: 20, fontWeight: 700 } }, { type: "text", props: { parentId: "$0", content: "Description text", fontSize: 14, fills: [{color: "#666666"}] } }]. You may use up to 50 shapes per batch for complex components.',
    {
      ...draftId,
      shapes: z
        .array(
          z.object({
            type: z
              .enum(SHAPE_TYPES)
              .describe(
                `${SHAPE_TYPE_DOC} When iconName is set, type is ignored (auto-set to "svg").`,
              ),
            childIndex: z
              .number()
              .optional()
              .describe(
                'Insert position among siblings (0 = first child). Omit to append as last child.',
              ),
            iconName: z
              .string()
              .optional()
              .describe(
                'Lucide icon name (e.g. "search", "user", "folder"). When set, creates an SVG icon shape — type is auto-set to "svg". Use list_icons to discover available names.',
              ),
            iconSize: z
              .number()
              .optional()
              .describe('Icon size in pixels (default 24). Only used when iconName is set.'),
            iconStrokeWidth: z
              .number()
              .optional()
              .describe('Icon stroke width (default 2). Only used when iconName is set.'),
            iconColor: z
              .string()
              .optional()
              .describe('Icon color as hex (default "#000000"). Only used when iconName is set.'),
            props: z.record(z.unknown()).optional().describe(BATCH_CREATE_PROPS_DOC),
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
            props: z.record(z.unknown()).describe(UPDATE_PROPS_DOC),
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
