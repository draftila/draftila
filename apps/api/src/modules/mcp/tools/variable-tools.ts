import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, defineTool } from './schemas';

export function registerVariableTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'list_variables',
    'List the draft\'s globals (named color tokens, shown as "Globals" in the editor), with a usageCount for each. Changing a global repaints every shape bound to it. Bind by setting colorVar to the global\'s **id** (never its display name) on a fill or stroke when creating a shape — e.g. fills: [{color: "#6C3CE9", colorVar: "primary"}] — and keep color set, since it is the fallback used if the global is missing. Gradient stops also accept colorVar via create_shape/update_shape props. To bind or unbind on a shape that already exists, use bind_variable/unbind_variable. Call this before set_variable so you do not overwrite an existing global, and pass variableId to get the shapeIds using it.',
    {
      ...draftId,
      variableId: z
        .string()
        .optional()
        .describe('Return only this global, plus the shapeIds and pageIds that reference it'),
    },
    async ({ draftId, variableId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_variables', {
        variableId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'bind_variable',
    'Bind a fill or stroke of an EXISTING shape to a global, without re-sending the whole array. When creating a shape, set colorVar directly in props instead — that is cheaper and does not need this call. Errors if the global does not exist, or if the fill is a gradient or image fill.',
    {
      ...draftId,
      shapeId: z.string().describe('The shape to bind (must be on the active page)'),
      target: z.enum(['fill', 'stroke']).describe('Which array to bind'),
      variableId: z.string().describe("The global's id, from list_variables"),
      index: z.number().optional().describe('Index within fills/strokes (default 0)'),
    },
    async ({ draftId, shapeId, target, variableId, index }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'bind_variable', {
        shapeId,
        target,
        variableId,
        index,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'unbind_variable',
    "Remove a global binding from a fill or stroke, keeping the colour it currently shows (the global's value is written into the shape first, so nothing changes visually).",
    {
      ...draftId,
      shapeId: z.string().describe('The shape to unbind (must be on the active page)'),
      target: z.enum(['fill', 'stroke']).describe('Which array to unbind'),
      index: z.number().optional().describe('Index within fills/strokes (default 0)'),
    },
    async ({ draftId, shapeId, target, index }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'unbind_variable', {
        shapeId,
        target,
        index,
      });
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
