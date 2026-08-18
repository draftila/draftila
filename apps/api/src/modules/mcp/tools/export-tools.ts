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
    'Export shapes as a PNG screenshot to visually verify your design. Use this after batch_create_shapes, import_html, and major updates to catch layout, clipping, and z-order issues early. Pass specific shapeIds to screenshot just those shapes, pass x/y/width/height to capture an exact canvas region, or omit both to capture everything. The automatic crop accounts for rotation, shadows, and outside strokes; output is capped at 4096x4096 pixels (scale is reduced automatically above that).',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
      scale: z.number().optional().describe('Pixel scale factor (default 1)'),
      backgroundColor: z.string().optional().describe('Background color hex (e.g. "#ffffff")'),
      x: z.number().optional().describe('Region capture: left edge in canvas coordinates'),
      y: z.number().optional().describe('Region capture: top edge in canvas coordinates'),
      width: z
        .number()
        .optional()
        .describe('Region capture: width in canvas units (requires x, y, and height)'),
      height: z
        .number()
        .optional()
        .describe('Region capture: height in canvas units (requires x, y, and width)'),
      padding: z
        .number()
        .optional()
        .describe('Extra canvas units of margin around the crop (default 0)'),
    },
    async ({ draftId, shapeIds, scale, backgroundColor, x, y, width, height, padding }) => {
      const result = (await sendToolRpc(draftId as string, getUserId(), 'export_png', {
        shapeIds,
        scale,
        backgroundColor,
        x,
        y,
        width,
        height,
        padding,
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
    'export_tailwind',
    'Export shapes as Tailwind CSS utility classes. Returns Tailwind v4 classes for each selected shape including dimensions, fills, strokes, shadows, blur, border-radius, and auto-layout (flexbox).',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_tailwind', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'export_tailwind_all_layers',
    'Export shapes and all their descendants as Tailwind CSS utility classes. Each shape gets a separate block with @apply directives and class selectors. Useful for exporting a full component tree with Tailwind classes.',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(
        draftId as string,
        getUserId(),
        'export_tailwind_all_layers',
        { shapeIds },
      );
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

  defineTool(
    server,
    'import_html',
    'Import HTML markup styled with Tailwind utility classes as native design shapes — the FASTEST way to build a whole screen or section in one call. Flex containers become auto-layout frames (flex/flex-col/gap/p-*/items-*/justify-* map to native layout), headings and paragraphs become text shapes (inline strong/em/span styling becomes rich-text segments), <img> becomes an image shape (src is downloaded into the draft), and inline <svg> becomes an svg shape. Sizing: w-*/h-* fix a dimension, w-full/flex-1/grow fill, everything else hugs content. Supported styling: Tailwind color palette + arbitrary values (bg-[#hex], w-[313px], text-[15px]), gradients (bg-linear-to-* with from-/via-/to-), borders, rounded-*, shadow-*, opacity, blur, and a small inline style="" fallback. NOT supported (approximated with a warning): grid, responsive sm:/md:/lg: prefixes (base classes only), hover:/dark: states, margins (use gap/padding), absolute inside flex, tables, form controls. Returns { shapeIds, count, warnings } — read warnings to see what was approximated, then export_png to verify visually.',
    {
      ...draftId,
      html: z.string().min(1).max(512_000).describe('HTML markup with Tailwind utility classes'),
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
    async ({ draftId, html, targetParentId, x, y }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'import_html', {
        html,
        targetParentId,
        x,
        y,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'export_html',
    'Export shapes as a complete standalone HTML document. format "tailwind" (default) produces HTML with Tailwind utility classes and the Tailwind CDN script; "css" produces HTML with an embedded stylesheet. Google Fonts links are included automatically; admin-uploaded custom fonts are not embedded.',
    {
      ...draftId,
      shapeIds: optionalShapeIds,
      format: z
        .enum(['tailwind', 'css'])
        .optional()
        .describe('Output flavor: "tailwind" (default) or "css"'),
    },
    async ({ draftId, shapeIds, format }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_html', {
        shapeIds,
        format,
      });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );
}
