import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../src/app';
import { createMcpToken } from '../../../src/modules/mcp/mcp-token.service';
import { setRpcInterceptor } from '../../../src/modules/collaboration/collaboration.service';
import * as mcpCanvasService from '../../../src/modules/mcp/mcp-canvas.service';
import {
  type McpTestContext,
  setupMcpTests,
  resetMcpState,
  createTokenSecret,
  parseOpsFromArgs,
} from './mcp-helpers';

describe('mcp server routes', () => {
  let ctx: McpTestContext;

  beforeAll(async () => {
    ctx = await setupMcpTests();

    setRpcInterceptor(async (_draftId, tool, args) => {
      if (tool === 'canvas.snapshot') {
        const snapshotParentId = typeof args.parentId === 'string' ? args.parentId : undefined;
        const snapshotMaxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : undefined;
        return mcpCanvasService.getCanvasSnapshot(_draftId, snapshotParentId, snapshotMaxDepth);
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
      if (tool === 'canvas.get_layout') {
        const parentId = typeof args.parentId === 'string' ? args.parentId : null;
        const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 1;
        const problemsOnly = args.problemsOnly === true;
        return mcpCanvasService.getLayout(_draftId, parentId, maxDepth, problemsOnly);
      }
      if (tool === 'canvas.move_to_parent') {
        const ids = Array.isArray(args.ids) ? (args.ids as string[]) : [];
        const parentId = args.parentId as string | null;
        const index = typeof args.index === 'number' ? args.index : undefined;
        return mcpCanvasService.moveToParent(_draftId, ids, parentId, index);
      }
      if (tool === 'canvas.replace_properties') {
        const parentIds = Array.isArray(args.parentIds) ? (args.parentIds as string[]) : [];
        const replacements = (args.replacements ?? {}) as Record<
          string,
          Array<{ from: unknown; to: unknown }>
        >;
        return mcpCanvasService.replaceProperties(_draftId, parentIds, replacements);
      }
      if (tool === 'canvas.search_properties') {
        const parentIds = Array.isArray(args.parentIds) ? (args.parentIds as string[]) : [];
        const searchProps = Array.isArray(args.properties) ? (args.properties as string[]) : [];
        return mcpCanvasService.searchProperties(_draftId, parentIds, searchProps);
      }
      if (tool === 'canvas.find_empty_space') {
        const width = typeof args.width === 'number' ? args.width : 100;
        const height = typeof args.height === 'number' ? args.height : 100;
        const direction = typeof args.direction === 'string' ? args.direction : 'right';
        const padding = typeof args.padding === 'number' ? args.padding : 100;
        const nearShapeId = typeof args.nearShapeId === 'string' ? args.nearShapeId : null;
        return mcpCanvasService.findEmptySpace(
          _draftId,
          width,
          height,
          direction,
          padding,
          nearShapeId,
        );
      }
      if (tool === 'canvas.get_layer_tree') {
        const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : Infinity;
        return mcpCanvasService.getLayerTree(_draftId, maxDepth);
      }
      if (tool === 'canvas.set_image') {
        return { shapeId: args.shapeId, src: 'set' };
      }
      throw new Error(`Unknown tool: ${tool}`);
    });
  });

  afterAll(() => {
    setRpcInterceptor(null);
  });

  beforeEach(async () => {
    await resetMcpState(ctx.draftId);
  });

  test('POST /api/mcp returns 401 without bearer token', async () => {
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(res.status).toBe(401);
  });

  test('POST /api/mcp returns parse error for invalid JSON', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:projects:read']);

    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-mcp-token': secret,
      },
      body: '{"jsonrpc":"2.0",',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: number; message: string };
    };
    expect(body.error.code).toBe(-32700);
    expect(body.error.message).toBe('Parse error');
  });

  test('initialize and tools/list work with bearer token', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:projects:read']);

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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:write']);

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
    const secret = await createTokenSecret(ctx.userId, ['mcp:projects:read']);

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
    expect(body.result.structuredContent.data.some((project) => project.id === ctx.projectId)).toBe(
      true,
    );
  });

  test('tools/call rejects non-object arguments', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:projects:read']);

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
          name: 'projects.list',
          arguments: 'invalid',
        },
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: number; message: string };
    };
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toBe('Invalid params');
  });

  test('drafts.get rejects token with restricted draft ids', async () => {
    const created = await createMcpToken({
      ownerId: ctx.userId,
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
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(403);
  });

  test('canvas.apply_ops adds shape and snapshot includes it', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
          arguments: { draftId: ctx.draftId },
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
          arguments: { draftId: ctx.draftId },
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
          arguments: { draftId: ctx.draftId },
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
          arguments: { draftId: ctx.draftId },
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
            draftId: ctx.draftId,
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
          arguments: { draftId: ctx.draftId },
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
          arguments: { draftId: ctx.draftId, nameContains: 'Label', type: 'text', limit: 10 },
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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
          arguments: { draftId: ctx.draftId, ops: [{ type: 'delete_shapes', ids: ['x'] }] },
        },
      }),
    });

    expect(res.status).toBe(403);
  });

  test('canvas.apply_ops rejects duplicate_shapes refs length mismatch', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:write']);

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
            draftId: ctx.draftId,
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
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        content: Array<{ type: string; data: string; mimeType: string }>;
        structuredContent: {
          image: { data: string; mimeType: string; dataUrl: string };
        };
      };
    };

    expect(body.result.content[0]?.type).toBe('image');
    expect(body.result.content[0]?.mimeType).toBe('image/png');
    expect(body.result.content[0]?.data).toBe('dGVzdA==');
    expect(body.result.structuredContent.image.mimeType).toBe('image/png');
    expect(body.result.structuredContent.image.data).toBe('dGVzdA==');
    expect(body.result.structuredContent.image.dataUrl).toBe('data:image/png;base64,dGVzdA==');
  });

  test('tools/list includes canvas.screenshot', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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

  test('tools/list includes all new tools', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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

    const toolNames = body.result.tools.map((t) => t.name);
    expect(toolNames).toContain('canvas.get_layout');
    expect(toolNames).toContain('canvas.move_to_parent');
    expect(toolNames).toContain('canvas.replace_properties');
    expect(toolNames).toContain('canvas.search_properties');
    expect(toolNames).toContain('canvas.find_empty_space');
    expect(toolNames).toContain('canvas.get_layer_tree');
    expect(toolNames).toContain('canvas.get_guidelines');
  });

  test('canvas.get_layout returns layout with bounds', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: { x: 10, y: 10, width: 100, height: 80, name: 'Layout Rect' },
              },
            ],
          },
        },
      }),
    });

    const res = await app.request('/api/mcp', {
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
          name: 'canvas.get_layout',
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          nodes: Array<{
            id: string;
            name: string;
            type: string;
            bounds: { x: number; y: number; width: number; height: number };
            problems?: string[];
          }>;
        };
      };
    };

    expect(body.result.structuredContent.nodes.length).toBeGreaterThan(0);
    const rect = body.result.structuredContent.nodes.find((n) => n.name === 'Layout Rect');
    expect(rect).toBeDefined();
    expect(rect?.bounds.x).toBe(10);
    expect(rect?.bounds.width).toBe(100);
  });

  test('canvas.get_layout detects overlapping shapes', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: { x: 0, y: 0, width: 100, height: 100, name: 'Overlap A' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: { x: 50, y: 50, width: 100, height: 100, name: 'Overlap B' },
              },
            ],
          },
        },
      }),
    });

    const res = await app.request('/api/mcp', {
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
          name: 'canvas.get_layout',
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          nodes: Array<{
            name: string;
            problems?: string[];
          }>;
        };
      };
    };

    const overlapA = body.result.structuredContent.nodes.find((n) => n.name === 'Overlap A');
    expect(overlapA?.problems).toBeDefined();
    expect(overlapA?.problems?.some((p) => p.startsWith('overlaps_with:'))).toBe(true);
  });

  test('canvas.move_to_parent reparents shapes into a frame', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    const addRes = await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                ref: 'container',
                shapeType: 'frame',
                props: { x: 0, y: 0, width: 400, height: 400, name: 'Container Frame' },
              },
              {
                type: 'add_shape',
                ref: 'orphan',
                shapeType: 'rectangle',
                props: { x: 500, y: 500, width: 50, height: 50, name: 'Orphan Rect' },
              },
            ],
          },
        },
      }),
    });

    const addBody = (await addRes.json()) as {
      result: {
        structuredContent: { createdRefs: Record<string, string> };
      };
    };
    const containerId = addBody.result.structuredContent.createdRefs.container;
    const orphanId = addBody.result.structuredContent.createdRefs.orphan;

    const moveRes = await app.request('/api/mcp', {
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
          name: 'canvas.move_to_parent',
          arguments: {
            draftId: ctx.draftId,
            ids: [orphanId],
            parentId: containerId,
          },
        },
      }),
    });

    expect(moveRes.status).toBe(200);
    const moveBody = (await moveRes.json()) as {
      result: {
        structuredContent: { moved: number; parentId: string };
      };
    };
    expect(moveBody.result.structuredContent.moved).toBe(1);

    const snapshotRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-mcp-token': secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'canvas.snapshot',
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    const snapshotBody = (await snapshotRes.json()) as {
      result: {
        structuredContent: {
          shapes: Array<{ id: string; name: string; parentId: string | null }>;
        };
      };
    };

    const orphan = snapshotBody.result.structuredContent.shapes.find((s) => s.id === orphanId);
    expect(orphan?.parentId).toBe(containerId);
  });

  test('canvas.move_to_parent supports sibling index', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    const addRes = await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                ref: 'container',
                shapeType: 'frame',
                props: { x: 0, y: 0, width: 400, height: 400, name: 'Container Frame' },
              },
              {
                type: 'add_shape',
                ref: 'first',
                shapeType: 'rectangle',
                props: { x: 10, y: 10, width: 40, height: 40, name: 'First Rect' },
              },
              {
                type: 'add_shape',
                ref: 'second',
                shapeType: 'rectangle',
                props: { x: 70, y: 10, width: 40, height: 40, name: 'Second Rect' },
              },
            ],
          },
        },
      }),
    });

    const addBody = (await addRes.json()) as {
      result: {
        structuredContent: { createdRefs: Record<string, string> };
      };
    };
    const containerId = addBody.result.structuredContent.createdRefs.container;
    const firstId = addBody.result.structuredContent.createdRefs.first;
    const secondId = addBody.result.structuredContent.createdRefs.second;

    if (!containerId || !firstId || !secondId) {
      throw new Error('Expected created refs for container, first, and second');
    }

    const moveRes = await app.request('/api/mcp', {
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
          name: 'canvas.move_to_parent',
          arguments: {
            draftId: ctx.draftId,
            ids: [firstId, secondId],
            parentId: containerId,
            index: 0,
          },
        },
      }),
    });

    expect(moveRes.status).toBe(200);
    const moveBody = (await moveRes.json()) as {
      result: {
        structuredContent: { moved: number; parentId: string; index: number };
      };
    };
    expect(moveBody.result.structuredContent.moved).toBe(2);
    expect(moveBody.result.structuredContent.parentId).toBe(containerId);
    expect(moveBody.result.structuredContent.index).toBe(0);
  });

  test('canvas.search_properties finds unique colors and fonts', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    const addRes = await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                ref: 'search_parent',
                shapeType: 'frame',
                props: { x: 0, y: 0, width: 400, height: 400, name: 'Search Parent' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: {
                  x: 10,
                  y: 10,
                  width: 100,
                  height: 100,
                  parentId: '@search_parent',
                  fills: [{ color: '#FF0000' }],
                },
              },
              {
                type: 'add_shape',
                shapeType: 'text',
                props: {
                  x: 10,
                  y: 120,
                  width: 200,
                  height: 40,
                  parentId: '@search_parent',
                  content: 'Test',
                  fontFamily: 'Inter',
                  fontSize: 16,
                  fills: [{ color: '#000000' }],
                },
              },
            ],
          },
        },
      }),
    });

    const addBody = (await addRes.json()) as {
      result: {
        structuredContent: { createdRefs: Record<string, string> };
      };
    };
    const searchParentId = addBody.result.structuredContent.createdRefs.search_parent;

    const res = await app.request('/api/mcp', {
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
          name: 'canvas.search_properties',
          arguments: {
            draftId: ctx.draftId,
            parentIds: [searchParentId],
            properties: ['fillColor', 'fontFamily', 'fontSize'],
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          properties: Record<string, unknown[]>;
          shapesSearched: number;
        };
      };
    };

    expect(body.result.structuredContent.properties.fillColor).toBeDefined();
    expect(
      (body.result.structuredContent.properties.fillColor as string[]).some(
        (c) => c === '#ff0000' || c === '#FF0000',
      ),
    ).toBe(true);
    expect(body.result.structuredContent.properties.fontFamily).toContain('Inter');
    expect(body.result.structuredContent.properties.fontSize).toContain(16);
    expect(body.result.structuredContent.shapesSearched).toBeGreaterThanOrEqual(3);
  });

  test('canvas.replace_properties replaces fill colors', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    const addRes = await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                ref: 'replace_parent',
                shapeType: 'frame',
                props: { x: 0, y: 0, width: 400, height: 400, name: 'Replace Parent' },
              },
              {
                type: 'add_shape',
                ref: 'target_rect',
                shapeType: 'rectangle',
                props: {
                  x: 10,
                  y: 10,
                  width: 100,
                  height: 100,
                  parentId: '@replace_parent',
                  fills: [{ color: '#D9D9D9' }],
                  name: 'Target Rect',
                },
              },
            ],
          },
        },
      }),
    });

    const addBody = (await addRes.json()) as {
      result: {
        structuredContent: { createdRefs: Record<string, string> };
      };
    };
    const replaceParentId = addBody.result.structuredContent.createdRefs.replace_parent;
    const targetRectId = addBody.result.structuredContent.createdRefs.target_rect;

    const replaceRes = await app.request('/api/mcp', {
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
          name: 'canvas.replace_properties',
          arguments: {
            draftId: ctx.draftId,
            parentIds: [replaceParentId],
            replacements: {
              fillColor: [{ from: '#D9D9D9', to: '#3B82F6' }],
            },
          },
        },
      }),
    });

    expect(replaceRes.status).toBe(200);
    const replaceBody = (await replaceRes.json()) as {
      result: {
        structuredContent: { totalReplacements: number; shapesChecked: number };
      };
    };
    expect(replaceBody.result.structuredContent.totalReplacements).toBeGreaterThanOrEqual(1);

    const getRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-mcp-token': secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'canvas.get_shape',
          arguments: { draftId: ctx.draftId, shapeId: targetRectId },
        },
      }),
    });

    const getBody = (await getRes.json()) as {
      result: {
        structuredContent: {
          shape: { fills: Array<{ color: string }> };
        };
      };
    };

    expect(getBody.result.structuredContent.shape.fills[0]?.color).toBe('#3B82F6');
  });

  test('canvas.find_empty_space returns coordinates to the right', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: { x: 0, y: 0, width: 200, height: 200, name: 'Space Anchor' },
              },
            ],
          },
        },
      }),
    });

    const res = await app.request('/api/mcp', {
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
          name: 'canvas.find_empty_space',
          arguments: {
            draftId: ctx.draftId,
            width: 300,
            height: 400,
            direction: 'right',
            padding: 50,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: { x: number; y: number; width: number; height: number };
      };
    };

    expect(body.result.structuredContent.width).toBe(300);
    expect(body.result.structuredContent.height).toBe(400);
    expect(body.result.structuredContent.x).toBeGreaterThanOrEqual(250);
  });

  test('canvas.get_layer_tree returns nested tree structure', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                ref: 'tree_frame',
                shapeType: 'frame',
                props: { x: 0, y: 0, width: 400, height: 400, name: 'Tree Frame' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: {
                  x: 10,
                  y: 10,
                  width: 100,
                  height: 100,
                  parentId: '@tree_frame',
                  name: 'Tree Child',
                },
              },
            ],
          },
        },
      }),
    });

    const res = await app.request('/api/mcp', {
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
          name: 'canvas.get_layer_tree',
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          tree: Array<{
            id: string;
            name: string;
            type: string;
            children?: Array<{ id: string; name: string; type: string }>;
          }>;
          totalShapes: number;
        };
      };
    };

    expect(body.result.structuredContent.totalShapes).toBeGreaterThan(0);
    const treeFrame = body.result.structuredContent.tree.find((n) => n.name === 'Tree Frame');
    expect(treeFrame).toBeDefined();
    expect(treeFrame?.children).toBeDefined();
    const treeChild = treeFrame?.children?.find((c) => c.name === 'Tree Child');
    expect(treeChild).toBeDefined();
    expect(treeChild?.type).toBe('rectangle');
  });

  test('canvas.get_guidelines returns guidelines for a topic', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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
          name: 'canvas.get_guidelines',
          arguments: { topic: 'landing-page' },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          topic: string;
          layout: Record<string, unknown>;
          typography: Record<string, unknown>;
        };
      };
    };

    expect(body.result.structuredContent.topic).toBe('landing-page');
    expect(body.result.structuredContent.layout).toBeDefined();
    expect(body.result.structuredContent.typography).toBeDefined();
  });

  test('canvas.get_guidelines returns error for unknown topic', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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
          name: 'canvas.get_guidelines',
          arguments: { topic: 'nonexistent' },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: { error: string };
      };
    };

    expect(body.result.structuredContent.error).toContain('Unknown topic');
  });

  test('canvas.snapshot supports parentId filter', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read', 'mcp:canvas:write']);

    const addRes = await app.request('/api/mcp', {
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
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                ref: 'snap_frame',
                shapeType: 'frame',
                props: { x: 0, y: 0, width: 400, height: 400, name: 'Snapshot Frame' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: {
                  x: 10,
                  y: 10,
                  width: 50,
                  height: 50,
                  parentId: '@snap_frame',
                  name: 'Inside Rect',
                },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: { x: 500, y: 500, width: 50, height: 50, name: 'Outside Rect' },
              },
            ],
          },
        },
      }),
    });

    const addBody = (await addRes.json()) as {
      result: {
        structuredContent: { createdRefs: Record<string, string> };
      };
    };
    const snapFrameId = addBody.result.structuredContent.createdRefs.snap_frame;

    const res = await app.request('/api/mcp', {
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
          arguments: { draftId: ctx.draftId, parentId: snapFrameId },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          shapeCount: number;
          shapes: Array<{ name: string }>;
        };
      };
    };

    const names = body.result.structuredContent.shapes.map((s) => s.name);
    expect(names).toContain('Inside Rect');
    expect(names).toContain('Snapshot Frame');
    expect(names).not.toContain('Outside Rect');
  });
});

describe('mcp no editor connected', () => {
  let ctx: McpTestContext;

  beforeAll(async () => {
    ctx = await setupMcpTests();
  });

  beforeEach(async () => {
    await resetMcpState(ctx.draftId);
  });

  test('canvas.snapshot works without an editor connection', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:read'],
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
          name: 'canvas.snapshot',
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          shapeCount: number;
        };
      };
    };
    expect(body.result.structuredContent.shapeCount).toBe(0);
  });

  test('canvas.create_chart works without an editor connection', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    const createRes = await app.request('/api/mcp', {
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
          name: 'canvas.create_chart',
          arguments: {
            draftId: ctx.draftId,
            type: 'bar',
            title: 'Traffic',
            data: [
              { label: 'Mon', value: 120 },
              { label: 'Tue', value: 180 },
              { label: 'Wed', value: 90 },
            ],
          },
        },
      }),
    });

    expect(createRes.status).toBe(200);

    const snapshotRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.secret}`,
        'x-mcp-token': created.secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.find_shapes',
          arguments: { draftId: ctx.draftId, nameContains: 'Chart' },
        },
      }),
    });

    expect(snapshotRes.status).toBe(200);
    const snapshotBody = (await snapshotRes.json()) as {
      result: {
        structuredContent: {
          total: number;
        };
      };
    };
    expect(snapshotBody.result.structuredContent.total).toBeGreaterThan(0);
  });

  test('tools/list includes new tool definitions', async () => {
    const secret = await createTokenSecret(ctx.userId, ['mcp:canvas:read']);

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

    const toolNames = body.result.tools.map((t) => t.name);
    expect(toolNames).toContain('canvas.measure_text');
    expect(toolNames).toContain('canvas.focus_view');
    expect(toolNames).toContain('canvas.create_frame');
  });

  test('canvas.align works headlessly', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    const addRes = await app.request('/api/mcp', {
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
          name: 'canvas.apply_ops',
          arguments: {
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                ref: 'r1',
                props: { x: 10, y: 20, width: 50, height: 50, name: 'Rect1' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                ref: 'r2',
                props: { x: 80, y: 60, width: 50, height: 50, name: 'Rect2' },
              },
            ],
          },
        },
      }),
    });

    expect(addRes.status).toBe(200);
    const addBody = (await addRes.json()) as {
      result: { structuredContent: { createdRefs: Record<string, string> } };
    };
    const r1Id = addBody.result.structuredContent.createdRefs.r1;
    const r2Id = addBody.result.structuredContent.createdRefs.r2;

    const alignRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.secret}`,
        'x-mcp-token': created.secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.align',
          arguments: { draftId: ctx.draftId, ids: [r1Id, r2Id], axis: 'left' },
        },
      }),
    });

    expect(alignRes.status).toBe(200);
    const alignBody = (await alignRes.json()) as {
      result: { structuredContent: { aligned: number } };
    };
    expect(alignBody.result.structuredContent.aligned).toBe(2);
  });

  test('canvas.distribute works headlessly', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    const addRes = await app.request('/api/mcp', {
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
          name: 'canvas.apply_ops',
          arguments: {
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                ref: 'd1',
                props: { x: 0, y: 0, width: 40, height: 40, name: 'D1' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                ref: 'd2',
                props: { x: 60, y: 0, width: 40, height: 40, name: 'D2' },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                ref: 'd3',
                props: { x: 200, y: 0, width: 40, height: 40, name: 'D3' },
              },
            ],
          },
        },
      }),
    });

    expect(addRes.status).toBe(200);
    const addBody = (await addRes.json()) as {
      result: { structuredContent: { createdRefs: Record<string, string> } };
    };
    const d1Id = addBody.result.structuredContent.createdRefs.d1;
    const d2Id = addBody.result.structuredContent.createdRefs.d2;
    const d3Id = addBody.result.structuredContent.createdRefs.d3;

    const distRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.secret}`,
        'x-mcp-token': created.secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.distribute',
          arguments: {
            draftId: ctx.draftId,
            ids: [d1Id, d2Id, d3Id],
            axis: 'horizontal',
          },
        },
      }),
    });

    expect(distRes.status).toBe(200);
    const distBody = (await distRes.json()) as {
      result: { structuredContent: { distributed: number } };
    };
    expect(distBody.result.structuredContent.distributed).toBe(3);
  });

  test('canvas.measure_text works headlessly', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:read'],
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
          name: 'canvas.measure_text',
          arguments: {
            draftId: ctx.draftId,
            content: 'Hello World',
            fontSize: 16,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          width: number;
          height: number;
          lineCount: number;
          fontSize: number;
          fontFamily: string;
        };
      };
    };
    expect(body.result.structuredContent.width).toBeGreaterThan(0);
    expect(body.result.structuredContent.height).toBeGreaterThan(0);
    expect(body.result.structuredContent.lineCount).toBe(1);
    expect(body.result.structuredContent.fontSize).toBe(16);
    expect(body.result.structuredContent.fontFamily).toBe('Inter');
  });

  test('canvas.measure_text with maxWidth wraps text', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:read'],
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
          name: 'canvas.measure_text',
          arguments: {
            draftId: ctx.draftId,
            content: 'This is a longer text string that should wrap across multiple lines',
            fontSize: 16,
            maxWidth: 100,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { structuredContent: { lineCount: number; width: number } };
    };
    expect(body.result.structuredContent.lineCount).toBeGreaterThan(1);
    expect(body.result.structuredContent.width).toBeLessThanOrEqual(100);
  });

  test('canvas.create_frame works headlessly', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
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
          name: 'canvas.create_frame',
          arguments: {
            draftId: ctx.draftId,
            ref: 'myframe',
            props: { x: 0, y: 0, width: 400, height: 300, name: 'Test Frame' },
            layout: { direction: 'vertical', gap: 16, align: 'stretch', padding: 24 },
            children: [
              { shapeType: 'text', ref: 'title', props: { content: 'Hello' } },
              { shapeType: 'rectangle', ref: 'box', props: { width: 100, height: 50 } },
            ],
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        structuredContent: {
          createdRefs: Record<string, string>;
          createdShapeIds: string[];
        };
      };
    };
    expect(body.result.structuredContent.createdRefs.myframe).toBeDefined();
    expect(body.result.structuredContent.createdRefs.title).toBeDefined();
    expect(body.result.structuredContent.createdRefs.box).toBeDefined();
    expect(body.result.structuredContent.createdShapeIds.length).toBe(3);
  });

  test('canvas.create_chart with gridlines creates gridline shapes', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    const createRes = await app.request('/api/mcp', {
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
          name: 'canvas.create_chart',
          arguments: {
            draftId: ctx.draftId,
            type: 'bar',
            title: 'Sales',
            gridlines: true,
            gridlineCount: 3,
            data: [
              { label: 'Q1', value: 100 },
              { label: 'Q2', value: 200 },
            ],
          },
        },
      }),
    });

    expect(createRes.status).toBe(200);

    const findRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.secret}`,
        'x-mcp-token': created.secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.find_shapes',
          arguments: { draftId: ctx.draftId, nameContains: 'Gridline' },
        },
      }),
    });

    expect(findRes.status).toBe(200);
    const findBody = (await findRes.json()) as {
      result: { structuredContent: { total: number } };
    };
    expect(findBody.result.structuredContent.total).toBeGreaterThan(0);
  });

  test('canvas.create_chart with smooth line creates path shapes', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    const createRes = await app.request('/api/mcp', {
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
          name: 'canvas.create_chart',
          arguments: {
            draftId: ctx.draftId,
            type: 'line',
            smooth: true,
            data: [
              { label: 'A', value: 10 },
              { label: 'B', value: 30 },
              { label: 'C', value: 20 },
              { label: 'D', value: 50 },
            ],
          },
        },
      }),
    });

    expect(createRes.status).toBe(200);

    const findRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.secret}`,
        'x-mcp-token': created.secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.find_shapes',
          arguments: { draftId: ctx.draftId, nameContains: 'Line Series' },
        },
      }),
    });

    expect(findRes.status).toBe(200);
    const findBody = (await findRes.json()) as {
      result: { structuredContent: { total: number } };
    };
    expect(findBody.result.structuredContent.total).toBeGreaterThan(0);
  });

  test('overlap detection skips children in auto-layout frames', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    await app.request('/api/mcp', {
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
          name: 'canvas.apply_ops',
          arguments: {
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'frame',
                ref: 'alframe',
                props: {
                  x: 0,
                  y: 0,
                  width: 200,
                  height: 200,
                  name: 'AutoLayout Frame',
                  layoutMode: 'vertical',
                  layoutGap: 0,
                },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: {
                  parentId: '@alframe',
                  x: 0,
                  y: 0,
                  width: 200,
                  height: 100,
                  name: 'OverlapChild1',
                },
              },
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: {
                  parentId: '@alframe',
                  x: 0,
                  y: 50,
                  width: 200,
                  height: 100,
                  name: 'OverlapChild2',
                },
              },
            ],
          },
        },
      }),
    });

    const layoutRes = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.secret}`,
        'x-mcp-token': created.secret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.get_layout',
          arguments: { draftId: ctx.draftId, maxDepth: 2, problemsOnly: true },
        },
      }),
    });

    expect(layoutRes.status).toBe(200);
    const layoutBody = (await layoutRes.json()) as {
      result: {
        structuredContent: {
          layout: Array<{ problems?: string[]; children?: Array<{ problems?: string[] }> }>;
        };
      };
    };

    const allProblems: string[] = [];
    for (const node of layoutBody.result.structuredContent.layout ?? []) {
      if (node.problems) allProblems.push(...node.problems);
      for (const child of node.children ?? []) {
        if (child.problems) allProblems.push(...child.problems);
      }
    }
    const overlapProblems = allProblems.filter((p) => p.startsWith('overlaps_with:'));
    expect(overlapProblems.length).toBe(0);
  });

  test('canvas.screenshot requires an active editor connection', async () => {
    setRpcInterceptor(null);
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Server Token',
      scopes: ['mcp:canvas:write', 'mcp:canvas:read'],
      expiresInDays: 30,
    });

    await app.request('/api/mcp', {
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
          name: 'canvas.apply_ops',
          arguments: {
            draftId: ctx.draftId,
            ops: [
              {
                type: 'add_shape',
                shapeType: 'rectangle',
                props: { x: 0, y: 0, width: 100, height: 100, name: 'Screenshot Rect' },
              },
            ],
          },
        },
      }),
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
        id: 2,
        method: 'tools/call',
        params: {
          name: 'canvas.screenshot',
          arguments: { draftId: ctx.draftId },
        },
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: {
        code: number;
        message: string;
      };
    };
    expect(body.error.code).toBe(-32005);
    expect(body.error.message).toContain('No editor connected');
  });
});
