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
  'canvas.get_layout',
  'canvas.move_to_parent',
  'canvas.replace_properties',
  'canvas.search_properties',
  'canvas.find_empty_space',
  'canvas.get_layer_tree',
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

  if (toolName === 'canvas.get_guidelines') {
    return textResult(getDesignGuidelines(args.topic as string));
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

function getDesignGuidelines(topic: string): Record<string, unknown> {
  const guidelines: Record<string, Record<string, unknown>> = {
    'landing-page': {
      topic: 'landing-page',
      layout: {
        structure:
          'Use a single-column layout with clear visual hierarchy. Hero section at top, followed by features, social proof, and CTA.',
        screenWidth: 'Design at 1440px wide. Content area should be 1200px max-width, centered.',
        spacing:
          'Use consistent vertical spacing between sections: 80-120px. Inner section padding: 40-60px.',
        grid: '12-column grid with 24px gutters.',
      },
      typography: {
        hero: 'Hero headline: 48-72px, bold (700-900). Keep under 8 words.',
        subheading: 'Subheading: 20-24px, regular weight (400). 1-2 sentences max.',
        body: 'Body text: 16-18px, line-height 1.5-1.7. Max 70 characters per line.',
        cta: 'CTA button text: 16-18px, bold. Use action verbs (Get Started, Try Free).',
      },
      color: {
        palette: 'Use 1 primary color, 1-2 accent colors, and neutrals. Max 5 total colors.',
        contrast: 'Ensure 4.5:1 contrast ratio for text on backgrounds.',
        cta: 'CTA buttons should use the primary brand color. Make them visually dominant.',
      },
      bestPractices: [
        'Above-the-fold content should communicate the core value proposition.',
        'Use whitespace generously to avoid visual clutter.',
        'Include only one primary CTA per section.',
        'Use real or realistic placeholder images, never empty image frames.',
        'Social proof (logos, testimonials, stats) builds trust — include it early.',
      ],
    },
    'mobile-app': {
      topic: 'mobile-app',
      layout: {
        screenSize: 'Design at 390x844px (iPhone 14). Use safe areas: 47px top, 34px bottom.',
        navigation: 'Bottom tab bar (49px height) for primary navigation. Max 5 tabs.',
        spacing: 'Use 16px horizontal padding. Vertical spacing between elements: 8-16px.',
        touchTargets: 'Minimum touch target size: 44x44px.',
      },
      typography: {
        title: 'Screen titles: 28-34px, bold.',
        body: 'Body text: 15-17px, regular. Line-height: 1.3-1.5.',
        caption: 'Captions and labels: 12-13px.',
        systemFont: 'Prefer system fonts (SF Pro for iOS, Roboto for Android) or Inter.',
      },
      color: {
        darkMode: 'Design for both light and dark modes.',
        backgrounds: 'Use system background colors. Light: #FFFFFF, Dark: #000000 or #1C1C1E.',
        accents: 'Keep accent colors consistent across the app. Max 2 accent colors.',
      },
      bestPractices: [
        'Prioritize one primary action per screen.',
        'Use native-feeling patterns (pull-to-refresh, swipe gestures).',
        'Keep text concise — mobile users scan, not read.',
        'Design thumb-reachable zones for key interactions.',
        'Use bottom sheets instead of modals where possible.',
      ],
    },
    'web-app': {
      topic: 'web-app',
      layout: {
        structure: 'Sidebar (240-280px) + main content area. Or top nav + content.',
        contentWidth: 'Main content area: 800-1200px. Full-width for dashboards.',
        spacing: 'Page padding: 24-32px. Card spacing: 16-24px.',
        responsive: 'Design for 1440px, 1024px, and 768px breakpoints.',
      },
      typography: {
        pageTitle: 'Page titles: 24-32px, semi-bold (600).',
        sectionTitle: 'Section titles: 18-20px, semi-bold.',
        body: 'Body text: 14-16px, regular (400). Line-height: 1.5.',
        labels: 'Form labels: 14px, medium (500). Input text: 14-16px.',
      },
      color: {
        neutral: 'Use a neutral palette for chrome (gray-50 to gray-900).',
        semantic: 'Success: green, Warning: amber, Error: red, Info: blue.',
        focus: 'Clearly visible focus rings for keyboard navigation.',
      },
      bestPractices: [
        'Use consistent component patterns from a design system.',
        'Make empty states helpful with clear actions.',
        'Show loading states for async operations.',
        'Error messages should be specific and actionable.',
        'Support keyboard navigation throughout.',
      ],
    },
    dashboard: {
      topic: 'dashboard',
      layout: {
        grid: 'Use a card-based grid layout. Cards should have consistent sizing.',
        hierarchy: 'Most important KPIs at the top. Charts and tables below.',
        density: 'Dashboards can be denser than other UIs. Use 12-16px spacing between cards.',
        sidebar: 'Left sidebar for navigation (56-240px). Collapsible on smaller screens.',
      },
      typography: {
        kpiValues: 'KPI values: 24-36px, bold. Use tabular numbers.',
        kpiLabels: 'KPI labels: 12-14px, medium weight, muted color.',
        chartLabels: 'Chart axis labels: 11-12px.',
      },
      color: {
        dataViz:
          'Use a sequential or categorical color palette for charts. Max 6-8 distinct colors.',
        status: 'Green = positive/up, Red = negative/down, Gray = neutral.',
        cards: 'White cards on a light gray background (e.g., #F9FAFB).',
      },
      bestPractices: [
        'Lead with the most important metric.',
        'Use sparklines for trends, not just numbers.',
        'Provide time range selectors (today, 7d, 30d, 90d).',
        'Cards should be self-contained and scannable.',
        'Align chart axes and labels consistently.',
      ],
    },
    'design-system': {
      topic: 'design-system',
      components: {
        atoms: 'Buttons, inputs, labels, icons, badges, avatars.',
        molecules: 'Form fields (label+input+error), card headers, nav items.',
        organisms: 'Navigation bars, sidebars, forms, data tables, modals.',
      },
      spacing: {
        scale: 'Use a 4px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.',
        componentPadding: 'Small components: 8-12px. Medium: 12-16px. Large: 16-24px.',
      },
      naming: {
        convention: 'Use consistent naming: ComponentName/Variant/State.',
        states: 'Default, Hover, Focus, Active, Disabled.',
        variants: 'Primary, Secondary, Outline, Ghost, Destructive.',
      },
      bestPractices: [
        'Build small components first, compose into larger ones.',
        'Every component should have a clear default state.',
        'Use auto-layout frames for responsive components.',
        'Maintain consistent corner radii (e.g., 4px small, 8px medium, 12px large).',
        'Define and reuse a consistent color token system.',
      ],
    },
    typography: {
      topic: 'typography',
      scale: {
        modularScale:
          'Use a modular scale ratio (1.2 minor third, 1.25 major third, 1.333 perfect fourth).',
        sizes: 'Recommended scale: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72px.',
        lineHeight: 'Headings: 1.1-1.3. Body text: 1.4-1.6. Captions: 1.3-1.5.',
      },
      weights: {
        usage:
          'Regular (400) for body. Medium (500) for labels. Semi-bold (600) for subheadings. Bold (700) for headings.',
        limit: 'Use at most 3 weights in a design.',
      },
      pairing: {
        rule: 'Pair a serif with a sans-serif, or use one family with contrasting weights.',
        recommended: 'Inter + system serif, or a single variable font family.',
      },
      bestPractices: [
        'Max 2 font families per design.',
        'Maintain consistent line lengths (45-75 characters).',
        'Use sufficient line-height to improve readability.',
        'Left-align body text. Center-align only for short headings.',
        'Use letter-spacing sparingly — only for all-caps text (+0.05em).',
      ],
    },
    color: {
      topic: 'color',
      palette: {
        structure: 'Define a palette with: 1 primary, 1 secondary, 1 accent, plus neutrals.',
        neutrals: '9-10 shades of gray from near-white to near-black.',
        semantic: 'Success (green), Warning (amber/yellow), Error (red), Info (blue).',
      },
      usage: {
        backgrounds: 'Use the lightest neutrals for backgrounds.',
        text: 'Use the darkest neutrals for primary text. Medium for secondary text.',
        interactive: 'Primary color for interactive elements (links, buttons, focus rings).',
      },
      accessibility: {
        contrast: 'Text on background: minimum 4.5:1 (AA) for normal text, 3:1 for large text.',
        colorBlindness: "Don't rely solely on color to convey information. Use icons or labels.",
      },
      bestPractices: [
        'Use the 60-30-10 rule: 60% neutral, 30% secondary, 10% accent.',
        'Test your palette in both light and dark modes.',
        'Limit vibrant colors to interactive elements and key highlights.',
        'Use opacity/alpha variants for hover and disabled states.',
        'Ensure sufficient contrast for all text against its background.',
      ],
    },
    layout: {
      topic: 'layout',
      principles: {
        alignment: 'Align elements to a consistent grid. Use left-alignment as the default.',
        proximity: 'Group related elements close together. Separate unrelated elements.',
        hierarchy: 'Establish clear visual hierarchy through size, weight, and color.',
        whitespace: 'Use generous whitespace. It improves readability and focus.',
      },
      grid: {
        columns: '12-column grid for web. 4-column for mobile.',
        gutters: '16-24px gutters for web. 16px for mobile.',
        margins: '24-80px page margins depending on screen size.',
      },
      autoLayout: {
        horizontal: 'Use horizontal auto-layout for button rows, nav items, tag lists.',
        vertical: 'Use vertical auto-layout for forms, card content, lists.',
        nesting: 'Nest auto-layout frames to create complex responsive layouts.',
        sizing:
          'Use "fill" for flexible children, "hug" for content-sized, "fixed" for exact sizes.',
      },
      bestPractices: [
        'Use auto-layout (layoutMode) for all container frames.',
        'Consistent spacing is more important than specific values.',
        'Use frames with clip=true to create bounded sections.',
        'Align text baselines across columns.',
        'Use constraints for responsive designs within fixed-size frames.',
      ],
    },
  };

  const guide = guidelines[topic];
  if (!guide) {
    return { error: `Unknown topic. Available: ${Object.keys(guidelines).join(', ')}` };
  }
  return guide;
}
