import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import { db } from '../../src/db';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import {
  authenticateMcpToken,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '../../src/modules/mcp/mcp-token.service';
import { setRpcInterceptor } from '../../src/modules/collaboration/collaboration.service';
import * as mcpCanvasService from '../../src/modules/mcp/mcp-canvas.service';
import {
  mcpCanvasOpSchema,
  mcpCanvasApplyOpsSchema,
  shapeTypeSchema,
  type McpCanvasOp,
} from '@draftila/shared';
import { z } from 'zod';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

function parseCanvasOp(input: unknown): McpCanvasOp | null {
  const direct = mcpCanvasOpSchema.safeParse(input);
  if (direct.success) {
    if (
      direct.data.type === 'duplicate_shapes' &&
      direct.data.refs &&
      direct.data.refs.length !== direct.data.ids.length
    ) {
      return null;
    }
    return direct.data;
  }
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const rawType =
    (typeof raw.type === 'string' ? raw.type : null) ??
    (typeof raw.action === 'string' ? raw.action : null) ??
    (typeof raw.operation === 'string' ? raw.operation : null);
  if (!rawType) return null;
  const normalizedType = (() => {
    if (rawType === 'create' || rawType === 'insert' || rawType === 'create_shape')
      return 'add_shape' as const;
    if (rawType === 'update' || rawType === 'patch_shape') return 'update_shape' as const;
    if (rawType === 'delete' || rawType === 'remove' || rawType === 'delete_shape')
      return 'delete_shapes' as const;
    if (rawType === 'move' || rawType === 'move_shapes') return 'move_stack' as const;
    if (rawType === 'group') return 'group_shapes' as const;
    if (rawType === 'ungroup') return 'ungroup_shapes' as const;
    if (rawType === 'duplicate' || rawType === 'clone' || rawType === 'copy_shapes')
      return 'duplicate_shapes' as const;
    return rawType;
  })();
  const shapeTypeValue =
    (typeof raw.shapeType === 'string' ? raw.shapeType : null) ??
    (typeof raw.kind === 'string' ? raw.kind : null) ??
    (typeof raw.shape === 'string' ? raw.shape : null);
  const propsValue =
    (raw.props && typeof raw.props === 'object' ? raw.props : null) ??
    (raw.properties && typeof raw.properties === 'object' ? raw.properties : null) ??
    (raw.data && typeof raw.data === 'object' ? raw.data : null) ??
    undefined;
  const idValue =
    (typeof raw.id === 'string' ? raw.id : null) ??
    (typeof raw.shapeId === 'string' ? raw.shapeId : null);
  const idsValue = Array.isArray(raw.ids)
    ? raw.ids.filter((item): item is string => typeof item === 'string')
    : undefined;
  const knownOpKeys = new Set([
    'type',
    'action',
    'operation',
    'shapeType',
    'ref',
    'kind',
    'shape',
    'props',
    'properties',
    'data',
    'id',
    'shapeId',
    'ids',
    'offset',
    'refs',
    'direction',
    'draftId',
    'op',
    'ops',
  ]);
  const topLevelProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (knownOpKeys.has(key)) continue;
    topLevelProps[key] = value;
  }
  const mergedProps =
    Object.keys(topLevelProps).length > 0
      ? { ...(propsValue ?? {}), ...topLevelProps }
      : propsValue;
  const candidate: Record<string, unknown> = { type: normalizedType };
  if (normalizedType === 'add_shape') {
    candidate.shapeType = shapeTypeValue;
    if (typeof raw.ref === 'string') candidate.ref = raw.ref;
    if (mergedProps) candidate.props = mergedProps;
  }
  if (normalizedType === 'update_shape') {
    candidate.id = idValue;
    candidate.props = mergedProps;
  }
  if (
    normalizedType === 'delete_shapes' ||
    normalizedType === 'group_shapes' ||
    normalizedType === 'ungroup_shapes'
  ) {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
  }
  if (normalizedType === 'move_stack') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    candidate.direction = raw.direction;
  }
  if (normalizedType === 'duplicate_shapes') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    if (raw.offset && typeof raw.offset === 'object') candidate.offset = raw.offset;
    if (Array.isArray(raw.refs))
      candidate.refs = raw.refs.filter((item): item is string => typeof item === 'string');
    if (
      Array.isArray(candidate.ids) &&
      Array.isArray(candidate.refs) &&
      candidate.ids.length !== candidate.refs.length
    )
      return null;
  }
  const parsedCandidate = mcpCanvasOpSchema.safeParse(candidate);
  if (!parsedCandidate.success) return null;
  return parsedCandidate.data;
}

function parseOpsFromArgs(args: Record<string, unknown>): McpCanvasOp[] {
  const rawOps = Array.isArray(args.ops) ? args.ops : args.op !== undefined ? [args.op] : null;
  if (!rawOps || rawOps.length === 0 || rawOps.length > 100) {
    throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
  }
  const normalizedOps: McpCanvasOp[] = [];
  for (const rawOp of rawOps) {
    const parsedOp = parseCanvasOp(rawOp);
    if (!parsedOp) {
      throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
    }
    normalizedOps.push(parsedOp);
  }
  return normalizedOps;
}

describe('mcp', () => {
  let userId: string;
  let authHeaders: Headers;
  let projectId: string;
  let draftId: string;

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    resetRateLimitStore('mcp-auth');
    const created = await createTestUser();
    userId = created.user.id;
    authHeaders = await getAuthHeaders('test@draftila.com', 'password123');

    const project = await projectsService.create({ name: 'MCP Project', ownerId: userId });
    projectId = project.id;
    const draft = await draftsService.create({ name: 'MCP Draft', projectId });
    draftId = draft.id;
  });

  beforeEach(async () => {
    await db.mcpAccessToken.deleteMany();
    await db.draft.updateMany({ where: { id: draftId }, data: { yjsState: null } });
    resetRateLimitStore('mcp-auth');
  });

  describe('mcp-token.service', () => {
    test('createMcpToken stores token and returns secret once', async () => {
      const created = await createMcpToken({
        ownerId: userId,
        name: 'Agent Token',
        scopes: ['mcp:projects:read', 'mcp:drafts:read', 'mcp:canvas:read'],
        expiresInDays: 90,
      });

      expect(created.secret.startsWith('dtk_')).toBe(true);
      expect(created.token.name).toBe('Agent Token');
      expect(created.token.scopes).toContain('mcp:canvas:read');
      expect(created.token.expiresAt).not.toBeNull();

      const auth = await authenticateMcpToken(created.secret);
      expect(auth).not.toBeNull();
      expect(auth!.ownerId).toBe(userId);
      expect(auth!.scopes.has('mcp:projects:read')).toBe(true);
    });

    test('authenticateMcpToken rejects malformed values', async () => {
      const result = await authenticateMcpToken('invalid-token');
      expect(result).toBeNull();
    });

    test('listMcpTokens returns owner tokens', async () => {
      await createMcpToken({
        ownerId: userId,
        name: 'Token One',
        scopes: ['mcp:projects:read'],
        expiresInDays: 30,
      });
      await createMcpToken({
        ownerId: userId,
        name: 'Token Two',
        scopes: ['mcp:drafts:read'],
        expiresInDays: 30,
      });

      const tokens = await listMcpTokens(userId);
      expect(tokens).toHaveLength(2);
      expect(tokens.map((token) => token.name).sort()).toEqual(['Token One', 'Token Two']);
    });

    test('revokeMcpToken revokes and blocks auth', async () => {
      const created = await createMcpToken({
        ownerId: userId,
        name: 'Revoke Token',
        scopes: ['mcp:projects:read'],
        expiresInDays: 30,
      });

      const revoked = await revokeMcpToken(created.token.id, userId);
      expect(revoked).toBe(true);

      const auth = await authenticateMcpToken(created.secret);
      expect(auth).toBeNull();
    });
  });

  describe('mcp management routes', () => {
    test('GET /api/mcp/tokens returns 401 without session', async () => {
      const res = await app.request('/api/mcp/tokens');
      expect(res.status).toBe(401);
    });

    test('POST /api/mcp/tokens creates token with default 90 days', async () => {
      const res = await app.request('/api/mcp/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({
          name: 'CLI Token',
          scopes: ['mcp:projects:read', 'mcp:drafts:read', 'mcp:canvas:read'],
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        token: { name: string; expiresAt: string | null };
        secret: string;
      };
      expect(body.token.name).toBe('CLI Token');
      expect(body.secret.startsWith('dtk_')).toBe(true);
      expect(body.token.expiresAt).not.toBeNull();
    });

    test('GET /api/mcp/tokens lists created tokens', async () => {
      await createMcpToken({
        ownerId: userId,
        name: 'Listed Token',
        scopes: ['mcp:projects:read'],
        expiresInDays: 30,
      });

      const res = await app.request('/api/mcp/tokens', { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: Array<{ name: string }> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.name).toBe('Listed Token');
    });

    test('POST /api/mcp/tokens/:id/revoke revokes token', async () => {
      const created = await createMcpToken({
        ownerId: userId,
        name: 'Revokable',
        scopes: ['mcp:projects:read'],
        expiresInDays: 30,
      });

      const res = await app.request(`/api/mcp/tokens/${created.token.id}/revoke`, {
        method: 'POST',
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      const auth = await authenticateMcpToken(created.secret);
      expect(auth).toBeNull();
    });
  });

  describe('mcp server routes', () => {
    beforeAll(() => {
      setRpcInterceptor(async (_draftId, tool, args) => {
        if (tool === 'canvas.snapshot') {
          return mcpCanvasService.getCanvasSnapshot(_draftId);
        }
        if (tool === 'canvas.find_shapes') {
          return mcpCanvasService.findShapes(_draftId, {
            nameContains: typeof args.nameContains === 'string' ? args.nameContains : undefined,
            type:
              typeof args.type === 'string'
                ? (args.type as
                    | 'rectangle'
                    | 'ellipse'
                    | 'frame'
                    | 'text'
                    | 'path'
                    | 'group'
                    | 'line'
                    | 'arrow'
                    | 'star'
                    | 'polygon'
                    | 'image')
                : undefined,
            parentId: args.parentId !== undefined ? (args.parentId as string | null) : undefined,
            limit: typeof args.limit === 'number' ? args.limit : 50,
          });
        }
        if (tool === 'canvas.apply_ops') {
          const ops = parseOpsFromArgs(args);
          return mcpCanvasService.applyCanvasOps(_draftId, ops);
        }
        if (tool === 'canvas.apply_op') {
          const op = args.op ?? args;
          const adaptedArgs = { ...args, ops: [op] };
          const ops = parseOpsFromArgs(adaptedArgs);
          return mcpCanvasService.applyCanvasOps(_draftId, ops);
        }
        if (tool === 'canvas.get_shape') {
          const shapeId = typeof args.shapeId === 'string' ? args.shapeId : null;
          if (!shapeId) throw new Error('Invalid tool arguments');
          return mcpCanvasService.getShapeById(_draftId, shapeId);
        }
        if (tool === 'canvas.screenshot') {
          return { data: 'dGVzdA==', mimeType: 'image/png' };
        }
        if (
          tool === 'canvas.undo' ||
          tool === 'canvas.redo' ||
          tool === 'canvas.align' ||
          tool === 'canvas.distribute'
        ) {
          return { success: true };
        }
        throw new Error(`Unknown tool: ${tool}`);
      });
    });

    afterAll(() => {
      setRpcInterceptor(null);
    });

    async function createTokenSecret(
      scopes: Array<
        'mcp:projects:read' | 'mcp:drafts:read' | 'mcp:canvas:read' | 'mcp:canvas:write'
      >,
    ) {
      const created = await createMcpToken({
        ownerId: userId,
        name: 'Server Token',
        scopes,
        expiresInDays: 30,
      });
      const auth = await authenticateMcpToken(created.secret);
      expect(auth).not.toBeNull();
      return created.secret;
    }

    test('POST /api/mcp returns 401 without bearer token', async () => {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(res.status).toBe(401);
    });

    test('initialize and tools/list work with bearer token', async () => {
      const secret = await createTokenSecret(['mcp:projects:read']);

      const initRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      });

      expect(initRes.status).toBe(200);

      const listRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      });

      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
      expect(listBody.result.tools.length).toBeGreaterThan(0);
    });

    test('tools/list exposes valid canvas.apply_ops schema', async () => {
      const secret = await createTokenSecret(['mcp:canvas:write']);

      const listRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(listRes.status).toBe(200);
      const body = (await listRes.json()) as {
        result: {
          tools: Array<{
            name: string;
            inputSchema: {
              properties?: {
                ops?: {
                  items?: unknown;
                };
              };
            };
          }>;
        };
      };

      const applyOpsTool = body.result.tools.find((tool) => tool.name === 'canvas.apply_ops');
      expect(applyOpsTool).toBeDefined();
      expect(applyOpsTool?.inputSchema.properties?.ops?.items).toBeDefined();

      const findShapesTool = body.result.tools.find((tool) => tool.name === 'canvas.find_shapes');
      expect(findShapesTool).toBeDefined();
    });

    test('projects.list returns data through tools/call', async () => {
      const secret = await createTokenSecret(['mcp:projects:read']);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'projects.list', arguments: {} },
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: {
          structuredContent: { data: Array<{ id: string }> };
        };
      };
      expect(body.result.structuredContent.data.some((project) => project.id === projectId)).toBe(
        true,
      );
    });

    test('drafts.get rejects token with restricted draft ids', async () => {
      const created = await createMcpToken({
        ownerId: userId,
        name: 'Restricted Token',
        scopes: ['mcp:drafts:read'],
        draftIds: ['different-draft-id'],
        expiresInDays: 30,
      });

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.secret}`,
          'x-mcp-token': created.secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'drafts.get',
            arguments: { draftId },
          },
        }),
      });

      expect(res.status).toBe(403);
    });

    test('canvas.apply_ops adds shape and snapshot includes it', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'add_shape',
                  shapeType: 'rectangle',
                  props: { x: 40, y: 20, width: 140, height: 80, name: 'Card' },
                },
              ],
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);

      const snapshotRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.snapshot',
            arguments: { draftId },
          },
        }),
      });

      expect(snapshotRes.status).toBe(200);
      const snapshotBody = (await snapshotRes.json()) as {
        result: {
          structuredContent: {
            shapeCount: number;
            shapes: Array<{ name: string; type: string }>;
          };
        };
      };

      expect(snapshotBody.result.structuredContent.shapeCount).toBe(1);
      expect(snapshotBody.result.structuredContent.shapes[0]!.name).toBe('Card');
      expect(snapshotBody.result.structuredContent.shapes[0]!.type).toBe('rectangle');
    });

    test('canvas.apply_op adds a single shape', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_op',
            arguments: {
              draftId,
              op: {
                type: 'add_shape',
                shapeType: 'text',
                props: { x: 20, y: 20, width: 200, height: 40, name: 'Marker', content: 'Hi' },
              },
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);
      const body = (await applyRes.json()) as {
        result: {
          structuredContent: {
            appliedCount: number;
            shapeCount: number;
          };
        };
      };

      expect(body.result.structuredContent.appliedCount).toBe(1);
      expect(body.result.structuredContent.shapeCount).toBe(1);
    });

    test('canvas.apply_op accepts create_shape alias payload', async () => {
      const secret = await createTokenSecret(['mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_op',
            arguments: {
              draftId,
              op: {
                type: 'create_shape',
                shapeType: 'rectangle',
                props: { x: 10, y: 10, width: 80, height: 60, name: 'Alias Rect' },
              },
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);
    });

    test('canvas.apply_op accepts flattened create payload with geometry', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_op',
            arguments: {
              draftId,
              type: 'create_shape',
              shapeType: 'rectangle',
              x: 222,
              y: 333,
              width: 77,
              height: 55,
              name: 'Flat Rect',
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);

      const snapshotRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.snapshot',
            arguments: { draftId },
          },
        }),
      });

      expect(snapshotRes.status).toBe(200);
      const snapshotBody = (await snapshotRes.json()) as {
        result: {
          structuredContent: {
            shapes: Array<{ name: string; x: number; y: number; width: number; height: number }>;
          };
        };
      };

      const flatRect = snapshotBody.result.structuredContent.shapes.find(
        (shape) => shape.name === 'Flat Rect',
      );
      expect(flatRect).toBeDefined();
      expect(flatRect?.x).toBe(222);
      expect(flatRect?.y).toBe(333);
      expect(flatRect?.width).toBe(77);
      expect(flatRect?.height).toBe(55);
    });

    test('canvas.apply_ops supports @ref ids within a single batch', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'add_shape',
                  ref: 'card',
                  shapeType: 'rectangle',
                  props: { x: 10, y: 10, width: 120, height: 80, name: 'Temp Card' },
                },
                {
                  type: 'update_shape',
                  id: '@card',
                  props: { name: 'Card Final', x: 44 },
                },
              ],
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);
      const applyBody = (await applyRes.json()) as {
        result: {
          structuredContent: {
            createdRefs: Record<string, string>;
          };
        };
      };

      expect(typeof applyBody.result.structuredContent.createdRefs.card).toBe('string');

      const snapshotRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.snapshot',
            arguments: { draftId },
          },
        }),
      });

      expect(snapshotRes.status).toBe(200);
      const snapshotBody = (await snapshotRes.json()) as {
        result: {
          structuredContent: {
            shapes: Array<{ name: string; x: number }>;
          };
        };
      };

      const card = snapshotBody.result.structuredContent.shapes.find(
        (shape) => shape.name === 'Card Final',
      );
      expect(card).toBeDefined();
      expect(card?.x).toBe(44);
    });

    test('canvas.apply_ops resolves @ref in props.parentId', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'add_shape',
                  ref: 'screen',
                  shapeType: 'frame',
                  props: { x: 10, y: 10, width: 300, height: 180, name: 'Screen' },
                },
                {
                  type: 'add_shape',
                  ref: 'child',
                  shapeType: 'rectangle',
                  props: {
                    x: 20,
                    y: 20,
                    width: 120,
                    height: 80,
                    name: 'Child',
                    parentId: '@screen',
                  },
                },
                {
                  type: 'update_shape',
                  id: '@child',
                  props: {
                    parentId: '@screen',
                  },
                },
              ],
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);
      const applyBody = (await applyRes.json()) as {
        result: {
          structuredContent: {
            createdRefs: Record<string, string>;
          };
        };
      };

      const screenId = applyBody.result.structuredContent.createdRefs.screen;
      expect(typeof screenId).toBe('string');

      const snapshotRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.snapshot',
            arguments: { draftId },
          },
        }),
      });

      expect(snapshotRes.status).toBe(200);
      const snapshotBody = (await snapshotRes.json()) as {
        result: {
          structuredContent: {
            shapes: Array<{ name: string; parentId: string | null }>;
          };
        };
      };

      const child = snapshotBody.result.structuredContent.shapes.find(
        (shape) => shape.name === 'Child',
      );
      expect(child).toBeDefined();
      expect(child?.parentId).toBe(screenId);
    });

    test('canvas.find_shapes filters by name and type', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const seedRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'add_shape',
                  shapeType: 'rectangle',
                  props: { x: 10, y: 10, width: 100, height: 80, name: 'Card Alpha' },
                },
                {
                  type: 'add_shape',
                  shapeType: 'rectangle',
                  props: { x: 140, y: 10, width: 100, height: 80, name: 'Card Beta' },
                },
                {
                  type: 'add_shape',
                  shapeType: 'text',
                  props: {
                    x: 10,
                    y: 110,
                    width: 180,
                    height: 40,
                    name: 'Card Label',
                    content: 'Card',
                  },
                },
              ],
            },
          },
        }),
      });

      expect(seedRes.status).toBe(200);

      const findRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.find_shapes',
            arguments: {
              draftId,
              nameContains: 'card',
              type: 'rectangle',
              limit: 1,
            },
          },
        }),
      });

      expect(findRes.status).toBe(200);
      const findBody = (await findRes.json()) as {
        result: {
          structuredContent: {
            data: Array<{ id: string; type: string; name: string }>;
            total: number;
          };
        };
      };

      expect(findBody.result.structuredContent.total).toBe(2);
      expect(findBody.result.structuredContent.data).toHaveLength(1);
      expect(findBody.result.structuredContent.data[0]?.type).toBe('rectangle');
      const firstName = findBody.result.structuredContent.data[0]?.name;
      expect(firstName?.toLowerCase()).toContain('card');
    });

    test('canvas.apply_ops supports duplicate_shapes with refs', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'add_shape',
                  ref: 'template',
                  shapeType: 'rectangle',
                  props: { x: 10, y: 10, width: 120, height: 80, name: 'Template' },
                },
                {
                  type: 'duplicate_shapes',
                  ids: ['@template'],
                  offset: { x: 180, y: 0 },
                  refs: ['templateCopy'],
                },
                {
                  type: 'update_shape',
                  id: '@templateCopy',
                  props: { name: 'Template Copy', x: 210 },
                },
              ],
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);

      const snapshotRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.snapshot',
            arguments: { draftId },
          },
        }),
      });

      expect(snapshotRes.status).toBe(200);
      const snapshotBody = (await snapshotRes.json()) as {
        result: {
          structuredContent: {
            shapes: Array<{ name: string; x: number }>;
          };
        };
      };

      const copy = snapshotBody.result.structuredContent.shapes.find(
        (shape) => shape.name === 'Template Copy',
      );
      expect(copy).toBeDefined();
      expect(copy?.x).toBe(210);
    });

    test('canvas.apply_ops duplicate_shapes keeps child hierarchy', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read', 'mcp:canvas:write']);

      const applyRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'add_shape',
                  ref: 'frameA',
                  shapeType: 'frame',
                  props: { x: 20, y: 20, width: 300, height: 180, name: 'Frame A' },
                },
                {
                  type: 'add_shape',
                  shapeType: 'text',
                  props: {
                    x: 40,
                    y: 50,
                    width: 140,
                    height: 30,
                    parentId: '@frameA',
                    name: 'Label A',
                    content: 'Label',
                  },
                },
                {
                  type: 'duplicate_shapes',
                  ids: ['@frameA'],
                  offset: { x: 400, y: 0 },
                  refs: ['frameB'],
                },
              ],
            },
          },
        }),
      });

      expect(applyRes.status).toBe(200);
      const applyBody = (await applyRes.json()) as {
        result: {
          structuredContent: {
            createdRefs: Record<string, string>;
          };
        };
      };

      const frameBId = applyBody.result.structuredContent.createdRefs.frameB;
      expect(typeof frameBId).toBe('string');

      const findRes = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'canvas.find_shapes',
            arguments: { draftId, nameContains: 'Label', type: 'text', limit: 10 },
          },
        }),
      });

      expect(findRes.status).toBe(200);
      const findBody = (await findRes.json()) as {
        result: {
          structuredContent: {
            data: Array<{ parentId: string | null }>;
            total: number;
          };
        };
      };

      expect(findBody.result.structuredContent.total).toBe(2);
      const hasChildUnderFrameB = findBody.result.structuredContent.data.some(
        (shape) => shape.parentId === frameBId,
      );
      expect(hasChildUnderFrameB).toBe(true);
    });

    test('canvas.apply_ops returns 403 without write scope', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read']);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: { draftId, ops: [{ type: 'delete_shapes', ids: ['x'] }] },
          },
        }),
      });

      expect(res.status).toBe(403);
    });

    test('canvas.apply_ops rejects duplicate_shapes refs length mismatch', async () => {
      const secret = await createTokenSecret(['mcp:canvas:write']);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.apply_ops',
            arguments: {
              draftId,
              ops: [
                {
                  type: 'duplicate_shapes',
                  ids: ['a', 'b'],
                  refs: ['only-one-ref'],
                },
              ],
            },
          },
        }),
      });

      expect(res.status).toBe(400);
    });

    test('canvas.screenshot returns image content', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read']);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.screenshot',
            arguments: { draftId },
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: {
          content: Array<{ type: string; data: string; mimeType: string }>;
        };
      };

      expect(body.result.content[0]?.type).toBe('image');
      expect(body.result.content[0]?.mimeType).toBe('image/png');
      expect(body.result.content[0]?.data).toBe('dGVzdA==');
    });

    test('tools/list includes canvas.screenshot', async () => {
      const secret = await createTokenSecret(['mcp:canvas:read']);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result: { tools: Array<{ name: string }> };
      };

      const screenshotTool = body.result.tools.find((t) => t.name === 'canvas.screenshot');
      expect(screenshotTool).toBeDefined();
    });
  });

  describe('mcp no editor connected', () => {
    async function createTokenSecret(
      scopes: Array<
        'mcp:projects:read' | 'mcp:drafts:read' | 'mcp:canvas:read' | 'mcp:canvas:write'
      >,
    ) {
      const created = await createMcpToken({
        ownerId: userId,
        name: 'Server Token',
        scopes,
        expiresInDays: 30,
      });
      return created.secret;
    }

    test('canvas tools return 409 when no editor is connected', async () => {
      setRpcInterceptor(null);
      const secret = await createTokenSecret(['mcp:canvas:read']);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
          'x-mcp-token': secret,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'canvas.snapshot',
            arguments: { draftId },
          },
        }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toContain('No editor connected');
    });
  });
});
