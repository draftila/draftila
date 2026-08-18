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

const iconFields = {
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
};

const nestedShapeFields = {
  type: z.enum(SHAPE_TYPES).describe('Shape type. When iconName is set, auto-set to "svg".'),
  childIndex: z.number().optional().describe('Insert position among siblings.'),
  ...iconFields,
  props: z
    .record(z.unknown())
    .optional()
    .describe(
      'Shape properties — same format as the top-level props. x/y are relative to the parent shape. Do not set parentId; nesting via children already parents the shape.',
    ),
};

const nestedShapeLevel3 = z.object({
  ...nestedShapeFields,
  children: z
    .array(z.unknown())
    .optional()
    .describe('Deeper nested child shapes — same entry format, any depth.'),
});

const nestedShapeLevel2 = z.object({
  ...nestedShapeFields,
  children: z.array(nestedShapeLevel3).optional().describe('Nested child shapes of this shape.'),
});

const topLevelShape = z.object({
  type: z
    .enum(SHAPE_TYPES)
    .describe(`${SHAPE_TYPE_DOC} When iconName is set, type is ignored (auto-set to "svg").`),
  childIndex: z
    .number()
    .optional()
    .describe('Insert position among siblings (0 = first child). Omit to append as last child.'),
  ...iconFields,
  props: z.record(z.unknown()).optional().describe(BATCH_CREATE_PROPS_DOC),
  children: z
    .array(nestedShapeLevel2)
    .optional()
    .describe(
      'Nested child shapes created inside this shape. This is the RECOMMENDED way to build hierarchies: the tree is created depth-first, children are parented automatically, and their x/y are relative to the parent (omit x/y entirely inside auto-layout frames). Nesting can go to any depth.',
    ),
});

export function registerBatchTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'batch_create_shapes',
    'Create a whole shape tree in a single call — the PREFERRED way to build components, cards and sections (for entire screens from HTML/Tailwind markup, prefer import_html). All shapes are created in one document transaction with a single layout pass, so this is much faster than many create_shape calls and avoids rate limits. Express hierarchy with nested children arrays: children are parented automatically and positioned relative to their parent. The flat "$0"/"$1" parentId form is still accepted — refs index the depth-first flattened order — but nested children are clearer. Returns shapeIds in depth-first order (parents before their children). Creation order = z-order: create background shapes before foreground shapes. Limits: 100 top-level entries, 200 shapes total including nested children. Example — auto-layout card: [{ type: "frame", props: { x: 0, y: 0, width: 320, layoutSizingVertical: "hug", layoutMode: "vertical", layoutGap: 12, paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, fills: [{color: "#ffffff"}], cornerRadius: 12 }, children: [{ type: "text", props: { content: "Title", fontSize: 20, fontWeight: 700 } }, { type: "text", props: { content: "Description", fontSize: 14, fills: [{color: "#666666"}] } }] }]',
    {
      ...draftId,
      shapes: z
        .array(topLevelShape)
        .max(100)
        .describe('Array of shape trees to create, in order (max 100 top-level entries)'),
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
    'Update multiple shapes in a single call. More efficient than calling update_shape multiple times. Returns { ok, results: [{ shapeId, ok, error? }] } — ok is false when any update targeted a missing shape; the valid updates are still applied.',
    {
      ...draftId,
      updates: z
        .array(
          z.object({
            shapeId: z.string().describe('Shape ID to update'),
            props: z.record(z.unknown()).describe(UPDATE_PROPS_DOC),
          }),
        )
        .max(100)
        .describe('Array of shape updates (max 100)'),
    },
    async ({ draftId, updates }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'batch_update_shapes', {
        updates,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
