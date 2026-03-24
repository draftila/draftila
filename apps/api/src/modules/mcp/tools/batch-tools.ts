import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerBatchTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'batch_create_shapes',
    'Create multiple shapes in a single call — the recommended way to build complex designs efficiently. Shapes are created in order; use "$0", "$1", etc. as parentId to reference shapes created earlier in the batch. IMPORTANT: Creation order = z-order. Create background shapes before foreground shapes (e.g. colored rectangle at index 0, text on top at index 1). Example 1 — card with manual positioning: [{ type: "frame", props: { x: 0, y: 0, width: 320, height: 200, fills: [{color: "#ffffff"}], cornerRadius: 12, shadows: [{color: "#00000015", offsetX: 0, offsetY: 4, blur: 16}] } }, { type: "rectangle", props: { parentId: "$0", x: 0, y: 0, width: 320, height: 60, fills: [{color: "#6C3CE9"}] } }, { type: "text", props: { parentId: "$0", x: 24, y: 16, content: "Header", fontSize: 20, fontWeight: 700, fills: [{color: "#ffffff"}] } }]. Example 2 — auto-layout card (children positioned automatically, no x/y needed): [{ type: "frame", props: { x: 0, y: 0, width: 320, layoutSizingVertical: "hug", layoutMode: "vertical", layoutGap: 12, paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, fills: [{color: "#ffffff"}], cornerRadius: 12, shadows: [{color: "#00000015", offsetX: 0, offsetY: 4, blur: 16}] } }, { type: "text", props: { parentId: "$0", content: "Title", fontSize: 20, fontWeight: 700 } }, { type: "text", props: { parentId: "$0", content: "Description text", fontSize: 14, fills: [{color: "#666666"}] } }]. You can include many shapes in a single batch — no hard limit.',
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
            childIndex: z
              .number()
              .optional()
              .describe(
                'Insert position among siblings (0 = first child). Omit to append as last child.',
              ),
            props: z
              .record(z.unknown())
              .optional()
              .describe(
                'Same props as create_shape. Key props: x, y (relative to parent when parentId is set — e.g. x=20 means 20px from parent\'s left edge), width, height, rotation, name, opacity, parentId (use "$0", "$1" etc. to reference shapes created earlier in this batch). FILLS: [{color, opacity?, visible?, gradient?: {type: "linear", angle, stops: [{color, position}]} or {type: "radial", cx, cy, r, stops}}]. STROKES: [{color, width}]. EFFECTS: shadows [{color, offsetX, offsetY, blur, spread?}], blurs [{type, radius}]. CORNERS: cornerRadius, cornerRadiusTL/TR/BL/BR, cornerSmoothing. TEXT: content, fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform, textAutoResize ("width" auto-sizes to fit text — prevents wrapping). FRAME: clip (default true), layoutMode ("horizontal"|"vertical" — enables auto-layout so children are positioned automatically, no manual x/y needed on children), layoutGap, paddingTop/Right/Bottom/Left, layoutAlign, layoutJustify, layoutSizingHorizontal/layoutSizingVertical ("fixed"|"hug"|"fill")',
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
                'Same props as create_shape (see create_shape for full format details including gradient fills, shadows, blurs). Key props: x, y, width, height, rotation, name, opacity, visible, locked, parentId, fills, strokes, shadows, blurs, cornerRadius, cornerRadiusTL/TR/BL/BR, cornerSmoothing. Text: content, fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform, textAutoResize. Frame: clip, layoutMode, layoutGap, paddingTop/Right/Bottom/Left, layoutAlign, layoutJustify, layoutSizingHorizontal, layoutSizingVertical',
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
