import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerVariableTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'list_variables',
    'List all design variables (color tokens) in the draft. Variables let you define named colors that can be referenced across shapes, similar to Figma Variables.',
    draftId,
    async ({ draftId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_variables', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'set_variable',
    'Create or update a design variable (color token). Use this to define reusable colors that can be referenced by name. Pass the same id to update an existing variable.',
    {
      ...draftId,
      id: z
        .string()
        .describe(
          'Unique variable ID. Use a descriptive slug like "primary", "bg-surface", "text-muted".',
        ),
      name: z
        .string()
        .describe('Display name for the variable (e.g. "Primary", "Background Surface")'),
      value: z.string().describe('Color value as hex (e.g. "#6C3CE9", "#0A0E1A")'),
    },
    async ({ draftId, id, name, value }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'set_variable', {
        id,
        name,
        value,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'delete_variable',
    'Delete a design variable by ID',
    {
      ...draftId,
      id: z.string().describe('Variable ID to delete'),
    },
    async ({ draftId, id }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'delete_variable', { id });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
