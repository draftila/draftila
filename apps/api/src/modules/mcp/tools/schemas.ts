import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const draftId = { draftId: z.string().describe('The draft ID to operate on') };

export const draftAndShape = {
  ...draftId,
  shapeId: z.string().describe('The shape ID'),
};

export const draftAndShapes = {
  ...draftId,
  shapeIds: z.array(z.string()).describe('Array of shape IDs'),
};

export const draftAndPage = {
  ...draftId,
  pageId: z.string().describe('The page ID'),
};

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  >;
}>;

export function defineTool(
  server: McpServer,
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  cb: ToolHandler,
) {
  (server as unknown as { tool: (...a: unknown[]) => void }).tool(name, description, schema, cb);
}
