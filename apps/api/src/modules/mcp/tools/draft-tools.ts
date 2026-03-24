import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as draftsService from '../../drafts/drafts.service';
import { defineTool } from './schemas';

export function registerDraftTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'list_drafts',
    'List all drafts accessible to the current user. Returns id, name, projectId, and timestamps.',
    {
      cursor: z.string().optional().describe('Pagination cursor from a previous response'),
      limit: z.number().optional().describe('Max drafts to return (default 20, max 100)'),
    },
    async ({ cursor, limit }) => {
      const drafts = await draftsService.listByUser(
        getUserId(),
        cursor as string | undefined,
        Math.min((limit as number | undefined) ?? 20, 100),
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(drafts) }] };
    },
  );
}
