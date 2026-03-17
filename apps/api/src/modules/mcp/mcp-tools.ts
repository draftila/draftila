import type { McpTokenScope } from '@draftila/shared';
import type { McpTokenAuthContext } from './mcp-token.service';
import {
  McpError,
  McpForbiddenError,
  McpDraftNotFoundError,
  McpInvalidToolArgumentsError,
  McpNoEditorConnectedError,
  McpRpcTimeoutError,
} from './mcp-errors';
import { getDesignGuidelines } from './mcp-guidelines';
import * as projectsService from '../projects/projects.service';
import * as draftsService from '../drafts/drafts.service';
import * as collaborationService from '../collaboration/collaboration.service';

type ToolResult =
  | { kind: 'text'; value: unknown }
  | { kind: 'image'; base64: string; mimeType: string };

type ToolHandler = (
  auth: McpTokenAuthContext,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpTokenScope;
  handler: ToolHandler;
}

function textResult(value: unknown): ToolResult {
  return { kind: 'text', value };
}

function imageResult(base64: string, mimeType = 'image/png'): ToolResult {
  return { kind: 'image', base64, mimeType };
}

function ensureDraftAccess(auth: McpTokenAuthContext, draft: { id: string; projectId: string }) {
  if (auth.draftIds && !auth.draftIds.has(draft.id)) {
    throw new McpForbiddenError();
  }
  if (auth.projectIds && !auth.projectIds.has(draft.projectId)) {
    throw new McpForbiddenError();
  }
}

function canAccessDraft(auth: McpTokenAuthContext, draft: { id: string; projectId: string }) {
  if (auth.draftIds && !auth.draftIds.has(draft.id)) {
    return false;
  }
  if (auth.projectIds && !auth.projectIds.has(draft.projectId)) {
    return false;
  }
  return true;
}

async function resolveDraft(auth: McpTokenAuthContext, draftId: unknown) {
  if (typeof draftId !== 'string' || !draftId) {
    throw new McpDraftNotFoundError();
  }
  const draft = await draftsService.getByIdForOwner(draftId, auth.ownerId);
  if (!draft) {
    throw new McpDraftNotFoundError();
  }
  ensureDraftAccess(auth, draft);
  return draft;
}

function ensureEditorConnected(draftId: string) {
  if (!collaborationService.hasActiveConnection(draftId)) {
    throw new McpNoEditorConnectedError();
  }
}

function remapRelayError(error: unknown): never {
  if (error instanceof McpError) {
    throw error;
  }
  if (error instanceof Error) {
    if (error.message === 'RPC timeout') {
      throw new McpRpcTimeoutError();
    }
    if (error.message.startsWith('Invalid tool arguments')) {
      throw new McpInvalidToolArgumentsError(error.message.replace('Invalid tool arguments: ', ''));
    }
  }
  throw error;
}

async function relayToEditor(
  auth: McpTokenAuthContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const draft = await resolveDraft(auth, args.draftId);
  ensureEditorConnected(draft.id);

  let result: unknown;
  try {
    result = await collaborationService.sendRpc(draft.id, toolName, args);
  } catch (error) {
    remapRelayError(error);
  }

  if (toolName === 'canvas.screenshot') {
    const response = result as { data?: string; mimeType?: string };
    if (response.data) {
      return imageResult(response.data, response.mimeType ?? 'image/png');
    }
    throw new Error('Screenshot failed');
  }

  return textResult(result);
}

function relayHandler(toolName: string): ToolHandler {
  return (auth, args) => relayToEditor(auth, toolName, args);
}

const canvasOpJsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'add_shape' },
        shapeType: {
          type: 'string',
          enum: [
            'rectangle',
            'ellipse',
            'frame',
            'text',
            'path',
            'group',
            'line',
            'arrow',
            'star',
            'polygon',
            'image',
          ],
        },
        ref: {
          type: 'string',
          pattern: '^[a-zA-Z0-9_-]+$',
          minLength: 1,
          maxLength: 64,
        },
        props: { type: 'object', additionalProperties: true },
      },
      required: ['type', 'shapeType'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'update_shape' },
        id: { type: 'string' },
        props: { type: 'object', additionalProperties: true },
      },
      required: ['type', 'id', 'props'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'delete_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'move_stack' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        direction: { type: 'string', enum: ['forward', 'backward', 'front', 'back'] },
      },
      required: ['type', 'ids', 'direction'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'group_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 2 },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'ungroup_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'duplicate_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
        offset: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
          additionalProperties: false,
        },
        refs: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]+$',
            minLength: 1,
            maxLength: 64,
          },
          minItems: 1,
          maxItems: 100,
        },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
  ],
} as const;

const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'projects.list',
    description: 'List projects for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        sort: {
          type: 'string',
          enum: ['last_edited', 'last_created', 'alphabetical'],
        },
      },
      additionalProperties: false,
    },
    requiredScope: 'mcp:projects:read',
    handler: async (auth, args) => {
      const { paginationSchema, sortSchema } = await import('@draftila/shared');
      const parsedPagination = paginationSchema.safeParse({
        cursor: args.cursor,
        limit: args.limit,
      });
      const parsedSort = sortSchema.safeParse(args.sort ?? 'last_edited');
      if (!parsedPagination.success || !parsedSort.success) {
        throw new Error('Invalid tool arguments');
      }
      const result = await projectsService.listByOwner(
        auth.ownerId,
        parsedPagination.data.cursor,
        parsedPagination.data.limit,
        parsedSort.data,
      );
      const filtered = result.data.filter((project) => {
        if (auth.projectIds && !auth.projectIds.has(project.id)) {
          return false;
        }
        return true;
      });
      return textResult({
        data: filtered,
        nextCursor: result.nextCursor,
      });
    },
  },
  {
    name: 'drafts.list',
    description: 'List drafts for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        sort: {
          type: 'string',
          enum: ['last_edited', 'last_created', 'alphabetical'],
        },
      },
      additionalProperties: false,
    },
    requiredScope: 'mcp:drafts:read',
    handler: async (auth, args) => {
      const { paginationSchema, sortSchema } = await import('@draftila/shared');
      const parsedPagination = paginationSchema.safeParse({
        cursor: args.cursor,
        limit: args.limit,
      });
      const parsedSort = sortSchema.safeParse(args.sort ?? 'last_edited');
      if (!parsedPagination.success || !parsedSort.success) {
        throw new Error('Invalid tool arguments');
      }
      const result = await draftsService.listByOwner(
        auth.ownerId,
        parsedPagination.data.cursor,
        parsedPagination.data.limit,
        parsedSort.data,
      );
      const filtered = result.data.filter((draft) => canAccessDraft(auth, draft));
      return textResult({
        data: filtered,
        nextCursor: result.nextCursor,
      });
    },
  },
  {
    name: 'drafts.get',
    description: 'Get a draft metadata object by id',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:drafts:read',
    handler: async (auth, args) => {
      const draft = await resolveDraft(auth, args.draftId);
      return textResult({ draft });
    },
  },
  {
    name: 'canvas.snapshot',
    description:
      'Get the current canvas shape snapshot for a draft. Returns all shapes with their key properties including type, position, dimensions, fills, strokes, text content, font settings, layout mode, and more. Use canvas.get_shape for the complete properties of a specific shape. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentId: {
          type: 'string',
          description: 'Optional: only return shapes within this parent frame/group.',
        },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Maximum depth to descend into children. If omitted, returns all shapes.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.snapshot'),
  },
  {
    name: 'canvas.find_shapes',
    description:
      'Find shapes by name/type/parent to discover shape ids. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        nameContains: { type: 'string' },
        type: {
          type: 'string',
          enum: [
            'rectangle',
            'ellipse',
            'frame',
            'text',
            'path',
            'group',
            'line',
            'arrow',
            'star',
            'polygon',
            'image',
          ],
        },
        parentId: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        limit: { type: 'number', minimum: 1, maximum: 200 },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.find_shapes'),
  },
  {
    name: 'canvas.get_shape',
    description:
      'Get the full properties of a specific shape by id. Returns all properties including fills, strokes, text content, font settings, etc. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeId: { type: 'string' },
      },
      required: ['draftId', 'shapeId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.get_shape'),
  },
  {
    name: 'canvas.apply_ops',
    description:
      'Apply shape operations to a draft canvas. Requires the draft to be open in the editor.\n\nShape types and their key properties:\n- rectangle: fills, strokes, cornerRadius (or cornerRadiusTL/TR/BL/BR), shadows, blurs\n- ellipse: fills, strokes, shadows, blurs\n- frame: fills, strokes, clip (default true), shadows, blurs, layoutMode, layoutGap, paddingTop/Right/Bottom/Left, layoutAlign, layoutJustify\n- text: content (the text string), fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform, fills (controls text color), segments (rich text)\n- path: points, svgPathData, fills, strokes\n- line: x1, y1, x2, y2, strokes\n- arrow: x1, y1, x2, y2, strokes, startArrowhead, endArrowhead\n- polygon: sides, fills, strokes\n- star: points (number of points), innerRadius, fills, strokes\n- image: use canvas.set_image after creation to set the source\n- group: container for grouping shapes\n\nCommon properties (all shapes): x, y, width, height, rotation, opacity, visible, locked, name, parentId\n\nText shapes: set "content" for the displayed text. Text color is controlled by "fills" (e.g. fills:[{color:"#FFFFFF"}]). Text shapes without explicit width/height are auto-sized to fit content.\n\nAvailable fonts (built-in): Inter, Arial, Helvetica, Times New Roman, Georgia, Courier New, system-ui, sans-serif, serif, monospace. Any Google Font name is also supported and will be loaded automatically.\n\nFills: each fill can have color, opacity (0-1, default 1), visible (default true), and optional gradient. Partial fill objects are fine \u2014 missing fields get defaults.\n\nGradient fills: any fill can include a "gradient" object. Linear: {type:"linear", angle:90, stops:[{color:"#FF0000",position:0},{color:"#0000FF",position:1}]}. Radial: {type:"radial", cx:0.5, cy:0.5, r:0.5, stops:[...]}.\n\nStrokes: color, width, opacity, visible, cap (butt/round/square), join (miter/round/bevel), align (center/inside/outside), dashPattern (solid/dash/dot/dash-dot). Per-side: "sides":{top:true, right:false, bottom:true, left:false} (rectangles/frames only).\n\nShadows: [{type:"drop"|"inner", x:0, y:4, blur:8, spread:0, color:"#00000040"}]\n\nBlurs: [{type:"background", radius:10}] for glassmorphism. [{type:"layer", radius:4}] for layer blur.\n\nAuto-layout: set layoutMode to "horizontal"/"vertical" with layoutGap, paddingTop/Right/Bottom/Left, layoutAlign (start/center/end/stretch), layoutJustify (start/center/end/space_between/space_around). Children can set layoutSizingHorizontal/layoutSizingVertical to "fill" to stretch.\n\nRich text: text shapes support "segments" array for inline styling: [{text:"Hello ", color:"#FFFFFF"}, {text:"world", color:"#8B5CF6", fontWeight:700}]. Each segment can override: color, fontSize, fontFamily, fontWeight, fontStyle, textDecoration, letterSpacing, gradient.\n\nSVG paths/icons: path shapes support "svgPathData" (SVG path d attribute string) for vector icons.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ops: {
          type: 'array',
          items: canvasOpJsonSchema,
          minItems: 1,
          maxItems: 200,
        },
      },
      required: ['draftId', 'ops'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.apply_ops'),
  },
  {
    name: 'canvas.apply_op',
    description:
      'Apply a single shape operation to a draft canvas. Requires the draft to be open in the editor. See canvas.apply_ops for full documentation on shape types, properties, fonts, fills, strokes, gradients, shadows, blurs, auto-layout, rich text, and SVG paths.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        op: canvasOpJsonSchema,
      },
      required: ['draftId', 'op'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.apply_op'),
  },
  {
    name: 'canvas.set_image',
    description:
      'Set the image source for an image shape. Accepts a URL or base64 data URI. Create an image shape first with canvas.apply_op, then use this tool to set its source. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeId: { type: 'string', description: 'The id of the image shape to set the source for' },
        src: {
          type: 'string',
          description:
            'Image source: a URL (https://...) or a base64 data URI (data:image/png;base64,...)',
        },
        fit: {
          type: 'string',
          enum: ['fill', 'fit', 'crop'],
          description: 'How the image fits in the frame. Defaults to fill.',
        },
      },
      required: ['draftId', 'shapeId', 'src'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.set_image'),
  },
  {
    name: 'canvas.screenshot',
    description:
      'Take a screenshot of the canvas or specific shapes. Returns a PNG image. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description:
            'Optional list of shape IDs to screenshot. If omitted, screenshots the entire canvas.',
        },
        scale: {
          type: 'number',
          minimum: 0.5,
          maximum: 4,
          description: 'Scale factor for the screenshot. Defaults to 2.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.screenshot'),
  },
  {
    name: 'canvas.undo',
    description: 'Undo the last canvas operation. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.undo'),
  },
  {
    name: 'canvas.redo',
    description:
      'Redo the last undone canvas operation. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.redo'),
  },
  {
    name: 'canvas.align',
    description:
      'Align shapes relative to each other. Aligns to the bounding box of the selected shapes. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        axis: {
          type: 'string',
          enum: ['left', 'center_horizontal', 'right', 'top', 'center_vertical', 'bottom'],
        },
      },
      required: ['draftId', 'ids', 'axis'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.align'),
  },
  {
    name: 'canvas.distribute',
    description:
      'Distribute shapes evenly along an axis. Requires at least 3 shapes. If gap is omitted, distributes evenly within the current bounding box. If gap is specified, spaces shapes with that exact gap. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
        },
        axis: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
        },
        gap: {
          type: 'number',
          description: 'Fixed gap between shapes. If omitted, distributes evenly.',
        },
      },
      required: ['draftId', 'ids', 'axis'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.distribute'),
  },
  {
    name: 'canvas.get_layout',
    description:
      'Inspect the layout structure of the canvas or a subtree. Returns bounding boxes and detects layout problems (overlapping siblings, children clipped by parent frame bounds). Use this to verify designs look correct and identify layout issues. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentId: {
          type: 'string',
          description:
            'Optional parent shape ID to inspect. If omitted, inspects all root-level shapes.',
        },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'How deep to descend into the tree. 0 = only the specified level. Defaults to 1.',
        },
        problemsOnly: {
          type: 'boolean',
          description:
            'If true, only returns shapes that have layout problems (overlapping, clipped). Defaults to false.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.get_layout'),
  },
  {
    name: 'canvas.move_to_parent',
    description:
      'Move shapes to a different parent (reparent). Moves shapes into a frame or group, or to the root canvas. Use this to build nested layouts by moving shapes into frames. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: 'Shape IDs to move.',
        },
        parentId: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description:
            'Target parent shape ID (must be a frame or group). Use null to move to root canvas.',
        },
        index: {
          type: 'number',
          minimum: 0,
          description:
            'Position among siblings in the target parent. 0 = first. If omitted, appends at the end.',
        },
      },
      required: ['draftId', 'ids', 'parentId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.move_to_parent'),
  },
  {
    name: 'canvas.replace_properties',
    description:
      'Bulk find-and-replace for visual properties across a subtree. Replace colors, fonts, font sizes, font weights, stroke widths, corner radii, and more. Useful for theming, restyling, and design system updates. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description:
            'Parent shape IDs whose subtrees to search. Use root shape IDs for the whole canvas.',
        },
        replacements: {
          type: 'object',
          description:
            'Property replacements to apply. Each key is a property type with an array of {from, to} pairs.',
          properties: {
            fillColor: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace fill colors (hex). E.g. [{from:"#D9D9D9", to:"#3B82F6"}]',
            },
            textColor: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace text fill colors (hex).',
            },
            strokeColor: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace stroke colors (hex).',
            },
            fontFamily: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace font families. E.g. [{from:"Inter", to:"Roboto"}]',
            },
            fontSize: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace font sizes.',
            },
            fontWeight: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace font weights.',
            },
            cornerRadius: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace corner radii.',
            },
            strokeWidth: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace stroke widths.',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['draftId', 'parentIds', 'replacements'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.replace_properties'),
  },
  {
    name: 'canvas.search_properties',
    description:
      'Find all unique visual property values used across a subtree. Returns unique fill colors, text colors, stroke colors, font families, font sizes, font weights, corner radii, and stroke widths. Useful for design audits, understanding the color palette, and preparing bulk replacements. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description: 'Parent shape IDs whose subtrees to search.',
        },
        properties: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'fillColor',
              'textColor',
              'strokeColor',
              'fontFamily',
              'fontSize',
              'fontWeight',
              'cornerRadius',
              'strokeWidth',
            ],
          },
          minItems: 1,
          description: 'Which properties to search for.',
        },
      },
      required: ['draftId', 'parentIds', 'properties'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.search_properties'),
  },
  {
    name: 'canvas.find_empty_space',
    description:
      'Find empty space on the canvas for placing new content. Searches in a given direction from existing content or a specific shape to find an unoccupied area of the requested size. Useful for adding new screens or components without overlapping existing designs. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        width: { type: 'number', minimum: 1, description: 'Required width of the empty space.' },
        height: { type: 'number', minimum: 1, description: 'Required height of the empty space.' },
        direction: {
          type: 'string',
          enum: ['right', 'bottom', 'left', 'top'],
          description: 'Direction to search for empty space. Defaults to "right".',
        },
        padding: {
          type: 'number',
          minimum: 0,
          description: 'Minimum padding from existing shapes. Defaults to 100.',
        },
        nearShapeId: {
          type: 'string',
          description:
            'Optional shape ID to search near. If omitted, searches relative to all canvas content.',
        },
      },
      required: ['draftId', 'width', 'height'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.find_empty_space'),
  },
  {
    name: 'canvas.get_layer_tree',
    description:
      'Get the hierarchical layer tree of the canvas. Returns shapes organized by parent-child relationships as a nested tree structure, making it easy to understand the document hierarchy. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Maximum depth to return. If omitted, returns the full tree.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.get_layer_tree'),
  },
  {
    name: 'canvas.get_guidelines',
    description:
      'Get contextual design guidelines and best practices for a specific design task type. Returns layout rules, spacing recommendations, typography guidance, and composition tips relevant to the task.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: [
            'landing-page',
            'mobile-app',
            'web-app',
            'dashboard',
            'design-system',
            'typography',
            'color',
            'layout',
          ],
          description: 'The type of design task to get guidelines for.',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: async (_auth, args) => {
      return textResult(getDesignGuidelines(args.topic as string));
    },
  },
];

const toolsByName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

export { MCP_TOOLS, toolsByName };
export type { McpToolDefinition, ToolResult };
