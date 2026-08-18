import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import * as collaborationService from '../../src/modules/collaboration/collaboration.service';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { initServerRpc } from '../../src/modules/mcp/server-rpc';
import { cleanApiKeys, cleanDatabase, createTestUser } from '../helpers';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface ShapeResult {
  id: string;
  type: string;
  width: number;
  height: number;
  parentId?: string;
  src?: string;
  content?: string;
  layoutMode?: string;
}

describe('mcp import_html', () => {
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
    const project = await projectsService.create({ name: 'Import Project', ownerId: userId });
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
    const { key } = await apiKeysService.create(userId, 'Import Test Key');
    validApiKey = key;
    initServerRpc();
  });

  async function callToolRaw(name: string, args: Record<string, unknown>) {
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
    return (await res.json()) as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      error?: unknown;
    };
  }

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const body = await callToolRaw(name, args);
    return JSON.parse(body.result?.content?.[0]?.text ?? '{}') as T;
  }

  async function createDraft(): Promise<string> {
    const draft = await draftsService.create({ name: 'Import Draft', projectId });
    seededDrafts.push(draft.id);
    return draft.id;
  }

  test('imports a tailwind card as a shape tree with localized images and warnings', async () => {
    const draftId = await createDraft();

    const result = await callTool<{ shapeIds: string[]; count: number; warnings: string[] }>(
      'import_html',
      {
        draftId,
        html: `
          <div class="flex flex-col gap-3 p-6 rounded-xl bg-white w-80 grid-cols-2">
            <h2 class="text-xl font-bold">Hello</h2>
            <img src="data:image/png;base64,${PNG_BASE64}" class="w-16 h-16" />
          </div>
        `,
      },
    );

    expect(result.shapeIds).toHaveLength(1);
    expect(result.count).toBe(3);
    expect(result.warnings.some((warning) => warning.includes('grid'))).toBe(true);

    const listed = await callTool<{ shapes: ShapeResult[] }>('list_shapes', { draftId });
    const frame = listed.shapes.find((shape) => shape.type === 'frame')!;
    const text = listed.shapes.find((shape) => shape.type === 'text')!;
    const image = listed.shapes.find((shape) => shape.type === 'image')!;

    expect(frame.width).toBe(320);
    expect(frame.layoutMode).toBe('vertical');
    expect(text.content).toBe('Hello');
    expect(text.parentId).toBe(frame.id);
    expect(image.parentId).toBe(frame.id);
    expect(image.width).toBe(64);
    expect(image.src).toContain('/draft-assets/');
    expect(image.src).not.toContain('data:');
  });

  test('rejects oversized html payloads', async () => {
    const draftId = await createDraft();
    const body = await callToolRaw('import_html', {
      draftId,
      html: `<div>${'x'.repeat(520_000)}</div>`,
    });
    expect(body.result?.isError ?? body.error !== undefined).toBe(true);
  });

  test('reports unknown classes as warnings without failing the import', async () => {
    const draftId = await createDraft();
    const result = await callTool<{ shapeIds: string[]; warnings: string[] }>('import_html', {
      draftId,
      html: '<p class="text-lg totally-made-up-class">Text</p>',
    });
    expect(result.shapeIds).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes('totally-made-up-class'))).toBe(true);
  });
});
