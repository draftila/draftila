import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndShapes, defineTool } from './schemas';

export function registerLayoutTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'group_shapes',
    'Group shapes together into a group',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'group_shapes', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'ungroup_shapes',
    'Ungroup shapes, releasing children',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'ungroup_shapes', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'frame_selection',
    'Wrap shapes in a frame container',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'frame_selection', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'align_shapes',
    'Align shapes relative to each other',
    {
      ...draftAndShapes,
      alignment: z
        .enum(['left', 'center-h', 'right', 'top', 'center-v', 'bottom'])
        .describe('Alignment direction'),
    },
    async ({ draftId, shapeIds, alignment }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'align_shapes', {
        shapeIds,
        alignment,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'distribute_shapes',
    'Distribute shapes evenly with equal spacing (needs 3+ shapes)',
    {
      ...draftAndShapes,
      direction: z.enum(['horizontal', 'vertical']).describe('Distribution direction'),
    },
    async ({ draftId, shapeIds, direction }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'distribute_shapes', {
        shapeIds,
        direction,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'apply_auto_layout',
    'Apply auto layout to a frame (arranges children in a flex-like layout). The frame must have layoutMode set to "horizontal" or "vertical" via create_shape or update_shape. Auto-layout uses: layoutGap (spacing between children), paddingTop/Right/Bottom/Left, layoutAlign (cross-axis: "start"|"center"|"end"|"stretch"), layoutJustify (main-axis: "start"|"center"|"end"|"space_between"). Children can use layoutSizingHorizontal/layoutSizingVertical ("fixed"|"hug"|"fill") to control how they size within the layout. Example — a button: create a frame with layoutMode="horizontal", padding=12, layoutAlign="center", layoutJustify="center", then add a text child. Call apply_auto_layout on the frame to position the text.',
    {
      ...draftId,
      frameId: z.string().describe('The frame ID to apply auto layout to'),
    },
    async ({ draftId, frameId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'apply_auto_layout', {
        frameId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
