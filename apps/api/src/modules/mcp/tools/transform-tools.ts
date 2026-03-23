import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftAndShapes, defineTool } from './schemas';

export function registerTransformTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'nudge_shapes',
    'Move shapes by a relative offset (dx, dy)',
    {
      ...draftAndShapes,
      dx: z.number().describe('Horizontal offset in pixels'),
      dy: z.number().describe('Vertical offset in pixels'),
    },
    async ({ draftId, shapeIds, dx, dy }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'nudge_shapes', {
        shapeIds,
        dx,
        dy,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'flip_shapes',
    'Flip shapes horizontally or vertically',
    {
      ...draftAndShapes,
      axis: z.enum(['horizontal', 'vertical']).describe('Flip axis'),
    },
    async ({ draftId, shapeIds, axis }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'flip_shapes', {
        shapeIds,
        axis,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'move_in_stack',
    'Move shapes in the layer stack (z-order)',
    {
      ...draftAndShapes,
      direction: z
        .enum(['forward', 'backward', 'to-front', 'to-back'])
        .describe('Stack movement direction'),
    },
    async ({ draftId, shapeIds, direction }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'move_in_stack', {
        shapeIds,
        direction,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'move_by_drop',
    'Move shapes into or next to a target shape (reparent/reorder)',
    {
      ...draftAndShapes,
      targetId: z.string().describe('Target shape ID'),
      placement: z
        .enum(['inside', 'before', 'after'])
        .describe('Where to place relative to target'),
    },
    async ({ draftId, shapeIds, targetId, placement }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'move_by_drop', {
        shapeIds,
        targetId,
        placement,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'boolean_operation',
    'Apply a boolean operation on overlapping shapes',
    {
      ...draftAndShapes,
      operation: z
        .enum(['union', 'subtract', 'intersect', 'exclude'])
        .describe('Boolean operation type'),
    },
    async ({ draftId, shapeIds, operation }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'boolean_operation', {
        shapeIds,
        operation,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
