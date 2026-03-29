import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

const MAX_EXPORT_SHAPE_IDS = 500;
const optionalShapeIds = z
  .array(z.string())
  .max(MAX_EXPORT_SHAPE_IDS)
  .optional()
  .describe(`Shape IDs to export (exports all shapes if omitted, max ${MAX_EXPORT_SHAPE_IDS} IDs)`);

export function registerExportTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'export_svg',
    'Export shapes as SVG markup',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_svg', { shapeIds });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'export_png',
    'Export shapes as a PNG screenshot to visually verify your design. Use this after batch_create_shapes and after major updates to catch layout, clipping, and z-order issues early. Pass specific shapeIds to screenshot just those shapes, or omit to capture everything.',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
      scale: z.number().optional().describe('Pixel scale factor (default 1)'),
      backgroundColor: z.string().optional().describe('Background color hex (e.g. "#ffffff")'),
    },
    async ({ draftId, shapeIds, scale, backgroundColor }) => {
      const result = (await sendToolRpc(draftId as string, getUserId(), 'export_png', {
        shapeIds,
        scale,
        backgroundColor,
      })) as { base64?: string; mimeType?: string; error?: string };
      if (!result.base64 || !result.mimeType) {
        return {
          content: [{ type: 'text' as const, text: result.error ?? 'No shapes to export' }],
        };
      }
      return {
        content: [
          {
            type: 'image' as const,
            data: result.base64,
            mimeType: result.mimeType,
          },
        ],
      };
    },
  );

  defineTool(
    server,
    'export_css',
    'Export shapes as CSS code. Returns CSS properties for each selected shape including dimensions, fills, strokes, shadows, blur, border-radius, and auto-layout (flexbox).',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_css', { shapeIds });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'export_css_all_layers',
    'Export shapes and all their descendants as CSS code. Each shape gets a separate CSS rule block with class selectors. Useful for exporting a full component tree.',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_css_all_layers', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'export_swiftui',
    'Export shapes as SwiftUI code. Generates hierarchical SwiftUI views with HStack/VStack/ZStack for auto-layout frames, shape modifiers, and Text views.',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_swiftui', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'export_compose',
    'Export shapes as Jetpack Compose code. Generates hierarchical Compose code with Row/Column/Box for auto-layout frames, Modifier chains, and Text composables.',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_compose', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'import_svg',
    'Import SVG markup as shapes onto the canvas. When targetParentId is set, x and y are relative to the parent frame. If x/y are omitted with a targetParentId, shapes are centered inside the parent frame. Triggers auto-layout recomputation when importing into auto-layout frames.',
    {
      ...draftId,
      svg: z.string().describe('SVG markup string'),
      targetParentId: z.string().optional().describe('Optional parent frame to import into'),
      x: z
        .number()
        .optional()
        .describe('X position (relative to parent when targetParentId is set)'),
      y: z
        .number()
        .optional()
        .describe('Y position (relative to parent when targetParentId is set)'),
    },
    async ({ draftId, svg, targetParentId, x, y }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'import_svg', {
        svg,
        targetParentId,
        x,
        y,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
