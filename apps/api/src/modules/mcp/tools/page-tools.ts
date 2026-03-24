import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndPage, defineTool } from './schemas';

export function registerPageTools(server: McpServer, getUserId: () => string) {
  defineTool(server, 'list_pages', 'List all pages in a draft', draftId, async ({ draftId }) => {
    const result = await sendToolRpc(draftId as string, getUserId(), 'list_pages', {});
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  defineTool(
    server,
    'add_page',
    'Add a new page to the draft',
    {
      ...draftId,
      name: z.string().optional().describe('Page name (auto-generated if omitted)'),
    },
    async ({ draftId, name }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'add_page', { name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'remove_page',
    'Remove a page from the draft',
    draftAndPage,
    async ({ draftId, pageId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'remove_page', { pageId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'rename_page',
    'Rename a page',
    {
      ...draftAndPage,
      name: z.string().describe('New page name'),
    },
    async ({ draftId, pageId, name }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'rename_page', {
        pageId,
        name,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'set_active_page',
    'Set the active page in the draft',
    draftAndPage,
    async ({ draftId, pageId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'set_active_page', {
        pageId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
