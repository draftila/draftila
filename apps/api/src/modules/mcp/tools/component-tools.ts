import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndShapes, defineTool } from './schemas';

export function registerComponentTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'create_component',
    'Create a reusable component from existing shapes. Use this to define patterns you want to reuse (e.g. icon+text row, input field, card template). After creating a component, use create_instance to stamp out copies at different positions. Instances are linked to the component definition.',
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
    'Stamp out a copy of a component at a given position. Use this after create_component to reuse patterns (e.g. placing multiple list items, repeated cards). The instance is linked to the component — future component updates will propagate.',
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
    'List all reusable components in a draft. Use this to discover existing components before creating new ones — you can reuse them with create_instance.',
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
