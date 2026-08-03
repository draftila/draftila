import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerVariableTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'list_variables',
    'List all design variables (color tokens) in the draft, with a usageCount for each. Variables are named colors that shapes bind to via colorVar: changing a variable repaints every shape bound to it. Bind by setting colorVar on a fill, stroke, shadow, gradient stop, layout guide or text segment (e.g. fills: [{color: "#6C3CE9", colorVar: "primary"}] — keep color set as the fallback used if the variable is missing). Call this before set_variable to avoid overwriting an existing variable.',
    draftId,
    async ({ draftId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_variables', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'set_variable',
    'Create or update a design variable (color token). Passing an id that already exists UPDATES it, which repaints every shape bound to it across the whole draft and cannot be undone by the user — call list_variables first if you intend to create a new variable. The response reports overwrote, usageCount and previousValue.',
    {
      ...draftId,
      id: z
        .string()
        .describe(
          'Unique variable ID. Use a descriptive slug like "primary", "bg-surface", "text-muted". Reusing an existing id overwrites that variable.',
        ),
      name: z
        .string()
        .describe('Display name for the variable (e.g. "Primary", "Background Surface")'),
      value: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Variable colors must be 6-digit hex, e.g. "#6C3CE9"')
        .describe(
          'Color value as 6-digit hex (e.g. "#6C3CE9"). Alpha is not part of a variable — each usage keeps its own opacity.',
        ),
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
    'Delete a design variable by ID. Every shape bound to it keeps its current color (the variable is inlined first), so nothing changes visually.',
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
