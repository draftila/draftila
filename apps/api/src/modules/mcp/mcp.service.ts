import type { McpTokenScope } from '@draftila/shared';
import type { McpTokenAuthContext } from './mcp-token.service';
import * as projectsService from '../projects/projects.service';
import * as draftsService from '../drafts/drafts.service';
import * as collaborationService from '../collaboration/collaboration.service';

const protocolVersion = '2025-06-18';

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

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpTokenScope;
}

const MCP_TOOLS: McpTool[] = [
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
  },
  {
    name: 'canvas.snapshot',
    description:
      'Get the current canvas shape snapshot for a draft. Returns all shapes with their key properties including type, position, dimensions, fills, strokes, text content, font settings, layout mode, and more. Use canvas.get_shape for the complete properties of a specific shape. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
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
  },
  {
    name: 'canvas.apply_ops',
    description:
      'Apply shape operations to a draft canvas. Requires the draft to be open in the editor.\n\nShape types and their key properties:\n- rectangle: fills, strokes, cornerRadius (or cornerRadiusTL/TR/BL/BR), shadows, blurs\n- ellipse: fills, strokes, shadows, blurs\n- frame: fills, strokes, clip (default true), shadows, blurs, layoutMode, layoutGap, paddingTop/Right/Bottom/Left, layoutAlign, layoutJustify\n- text: content (the text string), fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform, fills (controls text color), segments (rich text)\n- path: points, svgPathData, fills, strokes\n- line: x1, y1, x2, y2, strokes\n- arrow: x1, y1, x2, y2, strokes, startArrowhead, endArrowhead\n- polygon: sides, fills, strokes\n- star: points (number of points), innerRadius, fills, strokes\n- image: use canvas.set_image after creation to set the source\n- group: container for grouping shapes\n\nCommon properties (all shapes): x, y, width, height, rotation, opacity, visible, locked, name, parentId\n\nText shapes: set "content" for the displayed text. Text color is controlled by "fills" (e.g. fills:[{color:"#FFFFFF"}]). Text shapes without explicit width/height are auto-sized to fit content.\n\nAvailable fonts (built-in): Inter, Arial, Helvetica, Times New Roman, Georgia, Courier New, system-ui, sans-serif, serif, monospace. Any Google Font name is also supported and will be loaded automatically.\n\nFills: each fill can have color, opacity (0-1, default 1), visible (default true), and optional gradient. Partial fill objects are fine — missing fields get defaults.\n\nGradient fills: any fill can include a "gradient" object. Linear: {type:"linear", angle:90, stops:[{color:"#FF0000",position:0},{color:"#0000FF",position:1}]}. Radial: {type:"radial", cx:0.5, cy:0.5, r:0.5, stops:[...]}.\n\nStrokes: color, width, opacity, visible, cap (butt/round/square), join (miter/round/bevel), align (center/inside/outside), dashPattern (solid/dash/dot/dash-dot). Per-side: "sides":{top:true, right:false, bottom:true, left:false} (rectangles/frames only).\n\nShadows: [{type:"drop"|"inner", x:0, y:4, blur:8, spread:0, color:"#00000040"}]\n\nBlurs: [{type:"background", radius:10}] for glassmorphism. [{type:"layer", radius:4}] for layer blur.\n\nAuto-layout: set layoutMode to "horizontal"/"vertical" with layoutGap, paddingTop/Right/Bottom/Left, layoutAlign (start/center/end/stretch), layoutJustify (start/center/end/space_between/space_around). Children can set layoutSizingHorizontal/layoutSizingVertical to "fill" to stretch.\n\nRich text: text shapes support "segments" array for inline styling: [{text:"Hello ", color:"#FFFFFF"}, {text:"world", color:"#8B5CF6", fontWeight:700}]. Each segment can override: color, fontSize, fontFamily, fontWeight, fontStyle, textDecoration, letterSpacing, gradient.\n\nSVG paths/icons: path shapes support "svgPathData" (SVG path d attribute string) for vector icons.',
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
  },
];

const RELAY_TOOLS = new Set([
  'canvas.snapshot',
  'canvas.find_shapes',
  'canvas.get_shape',
  'canvas.apply_ops',
  'canvas.apply_op',
  'canvas.set_image',
  'canvas.screenshot',
  'canvas.undo',
  'canvas.redo',
  'canvas.align',
  'canvas.distribute',
]);

function ensureScope(auth: McpTokenAuthContext, scope: McpTokenScope) {
  if (!auth.scopes.has(scope)) {
    throw new Error('Forbidden');
  }
}

function ensureDraftAccess(auth: McpTokenAuthContext, draft: { id: string; projectId: string }) {
  if (auth.draftIds && !auth.draftIds.has(draft.id)) {
    throw new Error('Forbidden');
  }
  if (auth.projectIds && !auth.projectIds.has(draft.projectId)) {
    throw new Error('Forbidden');
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

function textResult(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}

function imageResult(base64: string, mimeType = 'image/png') {
  return {
    content: [{ type: 'image', data: base64, mimeType }],
    isError: false,
  };
}

async function resolveDraft(auth: McpTokenAuthContext, draftId: unknown) {
  if (typeof draftId !== 'string' || !draftId) {
    throw new Error('Invalid tool arguments');
  }
  const draft = await draftsService.getByIdForOwner(draftId, auth.ownerId);
  if (!draft) {
    throw new Error('Draft not found');
  }
  ensureDraftAccess(auth, draft);
  return draft;
}

function ensureEditorConnected(draftId: string) {
  if (!collaborationService.hasActiveConnection(draftId)) {
    throw new Error('No editor connected');
  }
}

export function createInitializeResult() {
  return {
    protocolVersion,
    serverInfo: {
      name: 'draftila-mcp',
      version: '0.1.0',
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
  };
}

export function listTools() {
  return {
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
}

export async function callTool(
  auth: McpTokenAuthContext,
  params: { name?: string; arguments?: unknown },
) {
  const toolName = params.name;
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  if (!toolName) {
    throw new Error('Invalid tool call');
  }

  const toolDef = MCP_TOOLS.find((tool) => tool.name === toolName);
  if (!toolDef) {
    throw new Error('Unknown tool');
  }
  ensureScope(auth, toolDef.requiredScope);

  if (toolName === 'projects.list') {
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
  }

  if (toolName === 'drafts.list') {
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
  }

  if (toolName === 'drafts.get') {
    const draft = await resolveDraft(auth, args.draftId);
    return textResult({ draft });
  }

  if (RELAY_TOOLS.has(toolName)) {
    const draft = await resolveDraft(auth, args.draftId);
    ensureEditorConnected(draft.id);

    const result = await collaborationService.sendRpc(draft.id, toolName, args);

    if (toolName === 'canvas.screenshot') {
      const response = result as { data?: string; mimeType?: string };
      if (response.data) {
        return imageResult(response.data, response.mimeType ?? 'image/png');
      }
      throw new Error('Screenshot failed');
    }

    return textResult(result);
  }

  throw new Error('Unknown tool');
}
