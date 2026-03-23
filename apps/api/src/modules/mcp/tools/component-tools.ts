import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndShapes, defineTool } from './schemas';

export function registerComponentTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'create_component',
    'Create a reusable component from shapes',
    {
      ...draftAndShapes,
      name: z.string().describe('Component name'),
    },
    async ({ draftId, shapeIds, name }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_component', {
        shapeIds,
        name,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'create_instance',
    'Create an instance of an existing component at a position',
    {
      ...draftId,
      componentId: z.string().describe('The component ID to instantiate'),
      x: z.number().describe('X position'),
      y: z.number().describe('Y position'),
      parentId: z.string().optional().describe('Optional parent frame to place instance in'),
    },
    async ({ draftId, componentId, x, y, parentId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_instance', {
        componentId,
        x,
        y,
        parentId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'list_components',
    'List all reusable components in a draft',
    draftId,
    async ({ draftId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_components', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'remove_component',
    'Remove a component definition (instances remain as regular shapes)',
    {
      ...draftId,
      componentId: z.string().describe('The component ID to remove'),
    },
    async ({ draftId, componentId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'remove_component', {
        componentId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
