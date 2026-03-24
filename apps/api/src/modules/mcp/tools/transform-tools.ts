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
    'Move shapes in the layer stack (z-order). Use "to-front" to bring a shape to the top (renders above all siblings) or "to-back" to send it behind everything. Use "forward"/"backward" for one-step adjustments. This controls rendering order — NOT layout order within auto-layout frames. To reorder children in an auto-layout frame, use move_by_drop with "before"/"after" placement instead.',
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
    'Move shapes into or next to a target shape. Use this to reparent shapes (placement: "inside") or reorder siblings within a parent (placement: "before"/"after"). Works for reordering children inside auto-layout frames — e.g. move a child before/after another child to change the layout order.',
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
