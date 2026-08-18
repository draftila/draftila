import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import * as collaborationService from '../../src/modules/collaboration/collaboration.service';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { initServerRpc } from '../../src/modules/mcp/server-rpc';
import { cleanApiKeys, cleanDatabase, createTestUser, getAuthHeaders, makeAdmin } from '../helpers';

const FIXTURE_DIR = join(import.meta.dir, '../fixtures/fonts');
const GOOGLE_CACHE_DIR = join(process.cwd(), '.cache', 'fonts');
const MEASURE_FONT_FILE = 'Acme_Measure-400.ttf';
const MEASURE_FONT_FAMILY = 'Acme Measure';

describe('mcp text measurement', () => {
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
    await makeAdmin(userId);
    await getAuthHeaders('test@draftila.com', 'password123');

    const project = await projectsService.create({ name: 'Measure Project', ownerId: userId });
    projectId = project.id;

    mkdirSync(GOOGLE_CACHE_DIR, { recursive: true });
    writeFileSync(
      join(GOOGLE_CACHE_DIR, MEASURE_FONT_FILE),
      readFileSync(join(FIXTURE_DIR, 'JetBrainsMono-Regular.ttf')),
    );
  });

  afterAll(() => {
    for (const id of seededDrafts) collaborationService.destroyRoom(id);
    collaborationService.setRpcInterceptor(null);
    rmSync(join(GOOGLE_CACHE_DIR, MEASURE_FONT_FILE), { force: true });
  });

  beforeEach(async () => {
    await cleanApiKeys();
    resetRateLimitStore('mcp');
    resetRateLimitStore('api-general');
    const { key } = await apiKeysService.create(userId, 'Measure Test Key');
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
    const draft = await draftsService.create({ name: 'Measure Draft', projectId });
    seededDrafts.push(draft.id);
    return draft.id;
  }

  async function createTextShape(
    draftId: string,
    content: string,
    props: Record<string, unknown> = {},
  ): Promise<{ id: string; width: number; height: number }> {
    const { shapeId } = await callTool<{ shapeId: string }>('create_shape', {
      draftId,
      type: 'text',
      props: {
        x: 0,
        y: 0,
        content,
        fontSize: 40,
        fontFamily: MEASURE_FONT_FAMILY,
        ...props,
      },
    });
    const shape = await callTool<{ id: string; width: number; height: number }>('get_shape', {
      draftId,
      shapeId,
    });
    return shape;
  }

  test('create_shape measures text width instead of the 200px fallback', async () => {
    const draftId = await createDraft();

    const short = await createTextShape(draftId, 'MMMM');
    expect(short.width).not.toBe(200);
    expect(short.width).toBeGreaterThan(40);
    expect(short.height).toBeGreaterThanOrEqual(48);

    const long = await createTextShape(draftId, 'MMMMMMMM');
    expect(long.width).toBeGreaterThan(short.width * 1.5);
  });

  test('update_shape re-measures when content changes', async () => {
    const draftId = await createDraft();
    const shape = await createTextShape(draftId, 'MM');

    await callTool('update_shape', {
      draftId,
      shapeId: shape.id,
      props: { content: 'MMMMMMMMMM' },
    });
    const updated = await callTool<{ width: number }>('get_shape', {
      draftId,
      shapeId: shape.id,
    });
    expect(updated.width).toBeGreaterThan(shape.width * 2);
  });

  test('hug-sized auto-layout frame adopts the measured text size', async () => {
    const draftId = await createDraft();

    const { shapeId: frameId } = await callTool<{ shapeId: string }>('create_shape', {
      draftId,
      type: 'frame',
      props: {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        layoutMode: 'vertical',
        layoutSizingHorizontal: 'hug',
        layoutSizingVertical: 'hug',
      },
    });

    const text = await createTextShape(draftId, 'MMMM', { parentId: frameId });

    const frame = await callTool<{ width: number; height: number }>('get_shape', {
      draftId,
      shapeId: frameId,
    });
    expect(frame.width).toBeCloseTo(text.width, 0);
    expect(frame.height).toBeCloseTo(text.height, 0);
  });
});
