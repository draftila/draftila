import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerExportTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'export_svg',
    'Export shapes as SVG markup',
    {
      ...draftId,
      shapeIds: z
        .array(z.string())
        .optional()
        .describe('Shape IDs to export (exports all shapes if omitted)'),
    },
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'export_svg', { shapeIds });
      return { content: [{ type: 'text' as const, text: result as string }] };
    },
  );

  defineTool(
    server,
    'import_svg',
    'Import SVG markup as shapes onto the canvas',
    {
      ...draftId,
      svg: z.string().describe('SVG markup string'),
      targetParentId: z.string().optional().describe('Optional parent frame to import into'),
      x: z.number().optional().describe('X position for imported shapes'),
      y: z.number().optional().describe('Y position for imported shapes'),
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
