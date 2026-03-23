import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftAndPage, defineTool } from './schemas';

export function registerGuideTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'list_guides',
    'List all ruler guides on a page',
    draftAndPage,
    async ({ draftId, pageId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_guides', { pageId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'add_guide',
    'Add a ruler guide line to a page',
    {
      ...draftAndPage,
      axis: z.enum(['x', 'y']).describe('Guide axis (x for vertical, y for horizontal)'),
      position: z.number().describe('Position in pixels along the axis'),
    },
    async ({ draftId, pageId, axis, position }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'add_guide', {
        pageId,
        axis,
        position,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'remove_guide',
    'Remove a ruler guide from a page',
    {
      ...draftAndPage,
      guideId: z.string().describe('The guide ID to remove'),
    },
    async ({ draftId, pageId, guideId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'remove_guide', {
        pageId,
        guideId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
