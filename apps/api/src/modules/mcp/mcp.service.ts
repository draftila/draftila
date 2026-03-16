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
      'Get the current canvas shape snapshot for a draft. Requires the draft to be open in the editor.',
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
    name: 'canvas.apply_ops',
    description:
      'Apply shape operations to a draft canvas. Requires the draft to be open in the editor. Frames support auto-layout: set layoutMode to "horizontal" or "vertical" with layoutGap, paddingTop/Right/Bottom/Left, layoutAlign (start/center/end/stretch), layoutJustify (start/center/end/space_between/space_around). Children can set layoutSizingHorizontal/layoutSizingVertical to "fill" to stretch. Auto-layout is computed automatically after operations.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ops: {
          type: 'array',
          items: canvasOpJsonSchema,
          minItems: 1,
          maxItems: 100,
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
      'Apply a single shape operation to a draft canvas. Requires the draft to be open in the editor. Frames support auto-layout: set layoutMode to "horizontal" or "vertical" with layoutGap, paddingTop/Right/Bottom/Left, layoutAlign (start/center/end/stretch), layoutJustify (start/center/end/space_between/space_around). Children can set layoutSizingHorizontal/layoutSizingVertical to "fill" to stretch. Auto-layout is computed automatically after operations.',
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
];

const RELAY_TOOLS = new Set([
  'canvas.snapshot',
  'canvas.find_shapes',
  'canvas.apply_ops',
  'canvas.apply_op',
  'canvas.screenshot',
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
