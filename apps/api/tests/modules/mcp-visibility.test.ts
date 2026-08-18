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
  name: string;
  content?: string;
  layoutMode?: string;
  fill?: string;
  visible?: boolean;
}

interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

function pngDimensions(base64: string): { width: number; height: number } {
  const bytes = Buffer.from(base64, 'base64');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('mcp visibility tools', () => {
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
    const project = await projectsService.create({ name: 'Visibility Project', ownerId: userId });
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
    const { key } = await apiKeysService.create(userId, 'Visibility Test Key');
    validApiKey = key;
    initServerRpc();
  });

  async function callToolContent(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolContent[]> {
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
    const body = (await res.json()) as { result?: { content?: ToolContent[] } };
    return body.result?.content ?? [];
  }

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const content = await callToolContent(name, args);
    return JSON.parse(content[0]?.text ?? '{}') as T;
  }

  async function seedDraft(): Promise<string> {
    const draft = await draftsService.create({ name: 'Visibility Draft', projectId });
    seededDrafts.push(draft.id);

    await callTool('batch_create_shapes', {
      draftId: draft.id,
      shapes: [
        {
          type: 'frame',
          props: {
            name: 'Card',
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            layoutMode: 'vertical',
            fills: [{ color: '#ffffff' }],
          },
          children: [
            {
              type: 'text',
              props: { name: 'Title', content: 'Welcome home', fontSize: 20 },
            },
            {
              type: 'text',
              props: { name: 'Subtitle', content: 'Sign in to continue', fontSize: 14 },
            },
          ],
        },
        {
          type: 'rectangle',
          props: {
            name: 'Hidden box',
            x: 400,
            y: 0,
            width: 50,
            height: 50,
            visible: false,
            fills: [{ color: '#ff0000' }],
          },
        },
      ],
    });
    return draft.id;
  }

  test('compact list_shapes includes content, layoutMode, fill, and hidden flag', async () => {
    const draftId = await seedDraft();
    const { shapes } = await callTool<{ shapes: CompactShape[] }>('list_shapes', {
      draftId,
      compact: true,
    });

    const frame = shapes.find((shape) => shape.name === 'Card')!;
    expect(frame.layoutMode).toBe('vertical');
    expect(frame.fill).toBe('#ffffff');

    const title = shapes.find((shape) => shape.name === 'Title')!;
    expect(title.content).toBe('Welcome home');

    const hidden = shapes.find((shape) => shape.name === 'Hidden box')!;
    expect(hidden.visible).toBe(false);
    expect(hidden.fill).toBe('#ff0000');

    expect(frame.visible).toBeUndefined();
  });

  test('find_shapes filters by name, type, and text with pagination', async () => {
    const draftId = await seedDraft();

    const byName = await callTool<{ matches: CompactShape[]; total: number }>('find_shapes', {
      draftId,
      query: 'card',
    });
    expect(byName.total).toBe(1);
    expect(byName.matches[0]!.name).toBe('Card');

    const byText = await callTool<{ matches: CompactShape[]; total: number }>('find_shapes', {
      draftId,
      text: 'sign in',
    });
    expect(byText.total).toBe(1);
    expect(byText.matches[0]!.name).toBe('Subtitle');

    const byType = await callTool<{ matches: CompactShape[]; total: number }>('find_shapes', {
      draftId,
      type: 'text',
    });
    expect(byType.total).toBe(2);

    const paged = await callTool<{ matches: CompactShape[]; total: number }>('find_shapes', {
      draftId,
      type: 'text',
      limit: 1,
      offset: 1,
    });
    expect(paged.total).toBe(2);
    expect(paged.matches).toHaveLength(1);

    const invalid = await callTool<{ error?: string }>('find_shapes', { draftId });
    expect(invalid.error).toContain('at least one');
  });

  test('export_html returns a tailwind document for the shapes', async () => {
    const draftId = await seedDraft();
    const content = await callToolContent('export_html', { draftId });
    const html = content[0]?.text ?? '';
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('flex-col');
    expect(html).toContain('Welcome home');
  });

  test('export_png captures an exact region', async () => {
    const draftId = await seedDraft();
    const content = await callToolContent('export_png', {
      draftId,
      x: 0,
      y: 0,
      width: 120,
      height: 80,
    });
    expect(content[0]?.type).toBe('image');
    const { width, height } = pngDimensions(content[0]!.data!);
    expect(width).toBe(120);
    expect(height).toBe(80);
  });

  test('export_png clamps oversized outputs', async () => {
    const draftId = await seedDraft();
    const content = await callToolContent('export_png', {
      draftId,
      x: 0,
      y: 0,
      width: 5000,
      height: 5000,
      scale: 4,
    });
    expect(content[0]?.type).toBe('image');
    const { width, height } = pngDimensions(content[0]!.data!);
    expect(width * height).toBeLessThanOrEqual(4096 * 4096 * 1.01);
  });

  test('set_page_background is reflected in list_pages', async () => {
    const draftId = await seedDraft();
    const { pageId } = await callTool<{ pageId: string }>('add_page', {
      draftId,
      name: 'Background page',
    });

    const result = await callTool<{ ok: boolean }>('set_page_background', {
      draftId,
      pageId,
      color: '#123456',
    });
    expect(result.ok).toBe(true);

    const updated = await callTool<{
      pages: Array<{ id: string; backgroundColor?: string }>;
    }>('list_pages', { draftId });
    const page = updated.pages.find((p) => p.id === pageId)!;
    expect(page.backgroundColor).toBe('#123456');
  });
});
