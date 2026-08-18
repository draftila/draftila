import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import * as collaborationService from '../../src/modules/collaboration/collaboration.service';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { initServerRpc } from '../../src/modules/mcp/server-rpc';
import { cleanApiKeys, cleanDatabase, createTestUser } from '../helpers';

interface CompactShape {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

describe('mcp batch tools', () => {
  let userId: string;
  let validApiKey: string;
  let projectId: string;
  const seededDrafts: string[] = [];

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    const result = await createTestUser();
    userId = result.user.id;
    const project = await projectsService.create({ name: 'Batch Project', ownerId: userId });
    projectId = project.id;
  });

  afterAll(() => {
    for (const id of seededDrafts) collaborationService.destroyRoom(id);
    collaborationService.setRpcInterceptor(null);
  });

  beforeEach(async () => {
    await cleanApiKeys();
    resetRateLimitStore('mcp');
    resetRateLimitStore('api-general');
    const { key } = await apiKeysService.create(userId, 'Batch Test Key');
    validApiKey = key;
    initServerRpc();
  });

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validApiKey}`,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name, arguments: args },
        id: '1',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { content?: Array<{ type: string; text?: string }> };
    };
    return JSON.parse(body.result?.content?.[0]?.text ?? '{}') as T;
  }

  async function createDraft(): Promise<string> {
    const draft = await draftsService.create({ name: 'Batch Draft', projectId });
    seededDrafts.push(draft.id);
    return draft.id;
  }

  async function getShape(draftId: string, shapeId: string): Promise<CompactShape> {
    return callTool<CompactShape>('get_shape', { draftId, shapeId });
  }

  test('creates a nested tree via children and parents automatically', async () => {
    const draftId = await createDraft();

    const result = await callTool<{ shapeIds: string[]; count: number }>('batch_create_shapes', {
      draftId,
      shapes: [
        {
          type: 'frame',
          props: {
            x: 0,
            y: 0,
            width: 300,
            layoutMode: 'vertical',
            layoutSizingVertical: 'hug',
            layoutGap: 8,
            paddingTop: 16,
            paddingRight: 16,
            paddingBottom: 16,
            paddingLeft: 16,
          },
          children: [
            { type: 'rectangle', props: { width: 100, height: 40 } },
            {
              type: 'frame',
              props: {
                layoutMode: 'horizontal',
                layoutSizingHorizontal: 'hug',
                layoutSizingVertical: 'hug',
                layoutGap: 4,
              },
              children: [{ type: 'rectangle', props: { width: 20, height: 20 } }],
            },
          ],
        },
      ],
    });

    expect(result.count).toBe(4);
    expect(result.shapeIds).toHaveLength(4);

    const [frameId, rectId, innerFrameId, innerRectId] = result.shapeIds as [
      string,
      string,
      string,
      string,
    ];
    const rect = await getShape(draftId, rectId);
    const innerFrame = await getShape(draftId, innerFrameId);
    const innerRect = await getShape(draftId, innerRectId);
    expect(rect.parentId).toBe(frameId);
    expect(innerFrame.parentId).toBe(frameId);
    expect(innerRect.parentId).toBe(innerFrameId);

    const frame = await getShape(draftId, frameId);
    expect(frame.height).toBe(40 + 20 + 8 + 32);
  });

  test('still resolves flat "$0" parent references', async () => {
    const draftId = await createDraft();

    const result = await callTool<{ shapeIds: string[] }>('batch_create_shapes', {
      draftId,
      shapes: [
        { type: 'frame', props: { x: 50, y: 50, width: 200, height: 200 } },
        { type: 'rectangle', props: { parentId: '$0', x: 10, y: 10, width: 30, height: 30 } },
      ],
    });

    const child = await getShape(draftId, result.shapeIds[1]!);
    expect(child.parentId).toBe(result.shapeIds[0]!);
    expect(child.x).toBe(10);
    expect(child.y).toBe(10);
  });

  test('rejects a forward "$N" reference with an error', async () => {
    const draftId = await createDraft();

    const result = await callTool<{ error?: string }>('batch_create_shapes', {
      draftId,
      shapes: [
        { type: 'rectangle', props: { parentId: '$1', width: 30, height: 30 } },
        { type: 'frame', props: { width: 200, height: 200 } },
      ],
    });

    expect(result.error).toContain('Invalid parentId reference');
  });

  test('rejects batches above 200 total nodes', async () => {
    const draftId = await createDraft();

    const result = await callTool<{ error?: string }>('batch_create_shapes', {
      draftId,
      shapes: [
        {
          type: 'frame',
          props: { width: 100, height: 100 },
          children: Array.from({ length: 200 }, () => ({
            type: 'rectangle',
            props: { width: 10, height: 10 },
          })),
        },
      ],
    });

    expect(result.error).toContain('max 200');
  });

  test('reports unknown props as warnings without failing', async () => {
    const draftId = await createDraft();

    const result = await callTool<{ shapeIds: string[]; warnings?: string[] }>(
      'batch_create_shapes',
      {
        draftId,
        shapes: [
          { type: 'rectangle', props: { x: 0, y: 0, width: 50, height: 50, conerRadius: 8 } },
        ],
      },
    );

    expect(result.shapeIds).toHaveLength(1);
    expect(result.warnings?.some((warning) => warning.includes('conerRadius'))).toBe(true);
  });

  test('batch_update_shapes reports per-item results', async () => {
    const draftId = await createDraft();
    const created = await callTool<{ shapeIds: string[] }>('batch_create_shapes', {
      draftId,
      shapes: [{ type: 'rectangle', props: { x: 0, y: 0, width: 50, height: 50 } }],
    });
    const shapeId = created.shapeIds[0]!;

    const result = await callTool<{
      ok: boolean;
      results: Array<{ shapeId: string; ok: boolean; error?: string }>;
    }>('batch_update_shapes', {
      draftId,
      updates: [
        { shapeId, props: { width: 80 } },
        { shapeId: 'missing-shape', props: { width: 80 } },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.results).toEqual([
      { shapeId, ok: true },
      { shapeId: 'missing-shape', ok: false, error: 'Shape not found' },
    ]);

    const updated = await getShape(draftId, shapeId);
    expect(updated.width).toBe(80);
  });
});
