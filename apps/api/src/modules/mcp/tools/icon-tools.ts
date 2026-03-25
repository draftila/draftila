import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerIconTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'list_icons',
    'List available built-in icons (Lucide icon set). Returns icon names that can be used with insert_icon. Pass a query to search/filter icons by name.',
    {
      ...draftId,
      query: z
        .string()
        .optional()
        .describe('Search query to filter icons by name (e.g. "arrow", "user", "settings")'),
    },
    async ({ draftId, query }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_icons', { query });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'insert_icon',
    'Insert a built-in icon (from the Lucide icon set) as an SVG shape. Use list_icons to discover available icon names. Icons are created as SVG shapes that can be positioned, colored, and nested inside frames like any other shape.',
    {
      ...draftId,
      name: z
        .string()
        .describe('Icon name (e.g. "search", "settings", "user", "arrow-right", "check", "star")'),
      x: z.number().optional().describe('X position (relative to parent when parentId is set)'),
      y: z.number().optional().describe('Y position (relative to parent when parentId is set)'),
      size: z.number().optional().describe('Icon size in pixels (default 24)'),
      strokeWidth: z.number().optional().describe('Stroke width (default 2)'),
      color: z.string().optional().describe('Icon color as hex (default "#000000")'),
      parentId: z.string().optional().describe('Parent frame ID to nest the icon inside'),
      childIndex: z
        .number()
        .optional()
        .describe(
          'Insert position among siblings (0 = first child, 1 = second, etc.). Only applies when parentId is set. Omit to append as last child.',
        ),
    },
    async ({ draftId, name, x, y, size, strokeWidth, color, parentId, childIndex }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'insert_icon', {
        name,
        x,
        y,
        size,
        strokeWidth,
        color,
        parentId,
        childIndex,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
