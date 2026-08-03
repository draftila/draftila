import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { addShape } from '@draftila/engine';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import * as collaborationService from '../../src/modules/collaboration/collaboration.service';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
// Importing `server-rpc` pulls in `dom-shim`, which replaces `globalThis.document` for this whole
// test file. Nothing here touches the DOM, so that is contained.
import { initServerRpc } from '../../src/modules/mcp/server-rpc';
import {
  cleanApiKeys,
  cleanDatabase,
  cleanFonts,
  createTestUser,
  getAuthHeaders,
  makeAdmin,
} from '../helpers';

const FIXTURE_DIR = join(import.meta.dir, '../fixtures/fonts');
const GOOGLE_CACHE_DIR = join(process.cwd(), '.cache', 'fonts');
/** `loadCachedFonts` maps this filename back to the family "Acme Shadow" at weight 400. */
const GOOGLE_SHADOW_FILE = 'Acme_Shadow-400.ttf';

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

function familyStyles(alias: string): Array<{ weight: number; style: string }> {
  const entry = GlobalFonts.families.find((f) => f.family === alias);
  return (entry?.styles ?? []).map((s) => ({ weight: s.weight, style: s.style }));
}

describe('mcp', () => {
  let userId: string;
  let validApiKey: string;
  let adminHeaders: Headers;
  let projectId: string;
  const seededDrafts: string[] = [];

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    const result = await createTestUser();
    userId = result.user.id;
    await makeAdmin(userId);
    adminHeaders = await getAuthHeaders('test@draftila.com', 'password123');

    const project = await projectsService.create({ name: 'MCP Project', ownerId: userId });
    projectId = project.id;
  });

  afterAll(() => {
    for (const id of seededDrafts) collaborationService.destroyRoom(id);
    collaborationService.setRpcInterceptor(null);
    // Only the file this suite planted — the rest of `.cache/fonts` is a developer's real cache.
    rmSync(join(GOOGLE_CACHE_DIR, GOOGLE_SHADOW_FILE), { force: true });
  });

  /** A draft whose room ydoc holds one text shape, ready for the export tools. */
  async function seedTextDraft(props: Record<string, unknown>): Promise<string> {
    const draft = await draftsService.create({ name: 'Export Draft', projectId });
    const room = await collaborationService.getOrCreateRoom(draft.id);
    addShape(room.ydoc, 'text', {
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      content: 'MMMM',
      fontSize: 40,
      ...props,
    });
    seededDrafts.push(draft.id);
    return draft.id;
  }

  async function uploadFont(source: string | Buffer, name: string) {
    const bytes = typeof source === 'string' ? fixture(source) : source;
    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], 'font.bin'));
    form.append('name', name);
    const headers = new Headers(adminHeaders);
    // `app.request` never populates Content-Length, which the upload route requires.
    headers.set('content-length', String(bytes.byteLength));
    const res = await app.request('/api/fonts', { method: 'POST', headers, body: form });
    expect(res.status).toBe(201);
    return (await res.json()) as {
      data: { id: string; variants: Array<{ id: string; weight: number; style: string }> };
    };
  }

  interface ToolContent {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<ToolContent[]> {
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

  beforeEach(async () => {
    await cleanApiKeys();
    resetRateLimitStore('mcp');
    resetRateLimitStore('font-upload');
    resetRateLimitStore('api-general');
    const { key } = await apiKeysService.create(userId, 'MCP Test Key');
    validApiKey = key;
    // `hasActiveConnection` is satisfied by the interceptor itself, so `requireBrowser` passes on
    // export tools without a real WS connection. Re-armed here because other tests null it out.
    initServerRpc();
  });

  describe('authentication', () => {
    test('returns 401 without Authorization header', async () => {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: '1' }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Unauthorized');
    });

    test('returns 401 with invalid API key', async () => {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dk_invalid_key',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: '1' }),
      });

      expect(res.status).toBe(401);
    });

    test('returns 401 with non-Bearer auth scheme', async () => {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${validApiKey}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: '1' }),
      });

      expect(res.status).toBe(401);
    });

    test('accepts valid API key and returns MCP response', async () => {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validApiKey}`,
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: '1' }),
      });

      expect(res.status).toBe(200);
    });

    test('DELETE method returns ok without auth', async () => {
      const res = await app.request('/api/mcp', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe('rate limiting', () => {
    test('MCP endpoint is rate limited to 60 requests per minute', async () => {
      resetRateLimitStore('mcp');

      for (let i = 0; i < 60; i++) {
        await app.request('/api/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${validApiKey}`,
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: String(i) }),
        });
      }

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validApiKey}`,
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 'overflow' }),
      });

      expect(res.status).toBe(429);
    });
  });

  describe('tool access', () => {
    test('list_drafts tool works with valid auth', async () => {
      collaborationService.setRpcInterceptor(async (_draftId, tool) => {
        if (tool === 'list_shapes') return { shapes: [], count: 0 };
        return {};
      });

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
          params: { name: 'list_drafts', arguments: {} },
          id: '1',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { result?: { content?: unknown[] } };
      expect(body.result).toBeDefined();
      expect(body.result!.content).toBeDefined();

      collaborationService.setRpcInterceptor(null);
    });

    test('revoked API key no longer authenticates', async () => {
      const { key, id } = await apiKeysService.create(userId, 'Revoke Me');
      await apiKeysService.remove(id, userId);

      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: '1' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('custom font exports', () => {
    beforeEach(async () => {
      await cleanFonts();
    });

    /**
     * CI regression guard for the empirical finding this whole feature rests on: `@napi-rs/canvas`
     * registers WOFF2 buffers and renders REAL glyphs from them. If a future upgrade breaks that,
     * the server would silently fall back while the browser renders correctly — this test fails
     * instead.
     */
    test('export_png registers a WOFF2 custom family and renders its real glyphs', async () => {
      const romanAlias = 'Acme Woff2 Roman';
      const italicAlias = 'Acme Woff2 Italic';
      expect(familyStyles(romanAlias)).toEqual([]);

      await uploadFont('JetBrainsMono-Regular.woff2', romanAlias);
      await uploadFont('JetBrainsMono-BoldItalic.woff2', italicAlias);
      const romanDraft = await seedTextDraft({ fontFamily: romanAlias, fontWeight: 400 });
      const italicDraft = await seedTextDraft({ fontFamily: italicAlias, fontWeight: 400 });

      const roman = await callTool('export_png', { draftId: romanDraft, scale: 1 });
      expect(roman[0]?.type).toBe('image');
      expect(roman[0]?.mimeType).toBe('image/png');
      // A blank 400×80 PNG base64s to under 500 chars — this guards against an empty render.
      expect((roman[0]?.data ?? '').length).toBeGreaterThan(1000);

      // The export registered each family under the literal document spelling, with the style
      // triple read out of the WOFF2's own OS/2 table.
      expect(familyStyles(romanAlias)).toEqual([{ weight: 400, style: 'normal' }]);

      // Two identical documents that differ ONLY in which WOFF2 is registered under their family
      // must paint differently — that is the "real glyphs, from this file" proof. (An
      // unregistered-alias control does NOT work here: `GlobalFonts.remove`, which the upload
      // renderability guard calls, leaves the removed typeface as skia's fallback for unknown
      // families, so a control alias measures identically.)
      const italic = await callTool('export_png', { draftId: italicDraft, scale: 1 });
      expect(familyStyles(italicAlias)).toEqual([{ weight: 700, style: 'italic' }]);
      expect(italic[0]?.data).toBeDefined();
      expect(italic[0]?.data).not.toBe(roman[0]?.data);
    });

    /**
     * §3.1: skia is asked for the shape's LITERAL `fontFamily` string, so registration must use
     * that spelling and not the family row's `name`. Registering `fam.name` would make the server
     * render fallback while the browser renders correctly — a silent divergence.
     */
    test('export_png registers under the literal document spelling, not the family row name', async () => {
      const uploadedAs = 'Acme Case';
      const docSpelling = 'acme case';
      await uploadFont('JetBrainsMono-Regular.woff2', uploadedAs);

      const draft = await seedTextDraft({ fontFamily: docSpelling, fontWeight: 400 });
      await callTool('export_png', { draftId: draft, scale: 1 });

      expect(familyStyles(docSpelling)).toEqual([{ weight: 400, style: 'normal' }]);
      expect(familyStyles(uploadedAs)).toEqual([]);
    });

    test('export_png picks up a variant delete and re-upload via the updatedAt token', async () => {
      const alias = 'Acme Delta';
      await uploadFont('JetBrainsMono-Regular.woff2', alias);
      const uploaded = await uploadFont('JetBrainsMono-BoldItalic.woff2', alias);
      const familyId = uploaded.data.id;
      const italic = uploaded.data.variants.find((v) => v.style === 'italic')!;

      const draft = await seedTextDraft({ fontFamily: alias, fontWeight: 400 });
      await callTool('export_png', { draftId: draft, scale: 1 });
      expect(familyStyles(alias)).toHaveLength(2);

      const del = await app.request(`/api/fonts/${familyId}/variants/${italic.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });
      expect(del.status).toBe(200);

      await callTool('export_png', { draftId: draft, scale: 1 });
      expect(familyStyles(alias)).toEqual([{ weight: 400, style: 'normal' }]);

      // Adding the variant back must bump the token again, or the family stays one-variant.
      await uploadFont('JetBrainsMono-BoldItalic.woff2', alias);
      await callTool('export_png', { draftId: draft, scale: 1 });
      expect(familyStyles(alias)).toHaveLength(2);
      expect(familyStyles(alias)).toContainEqual({ weight: 700, style: 'italic' });
    });

    test('export_png purges a same-named Google registration before registering the custom family', async () => {
      const alias = 'Acme Shadow';
      // Seed the Google path's on-disk cache so it registers without touching the network.
      mkdirSync(GOOGLE_CACHE_DIR, { recursive: true });
      writeFileSync(
        join(GOOGLE_CACHE_DIR, GOOGLE_SHADOW_FILE),
        fixture('JetBrainsMono-Regular.ttf'),
      );

      const draft = await seedTextDraft({ fontFamily: alias, fontWeight: 400 });
      await callTool('export_png', { draftId: draft, scale: 1 });
      expect(familyStyles(alias)).toEqual([{ weight: 400, style: 'normal' }]);

      // The custom family carries a DIFFERENT style triple, so a surviving Google registration
      // under the same alias would still be visible here.
      await uploadFont('JetBrainsMono-BoldItalic.woff2', alias);
      await callTool('export_png', { draftId: draft, scale: 1 });
      expect(familyStyles(alias)).toEqual([{ weight: 700, style: 'italic' }]);
    });

    test('export_svg embeds @font-face for a custom family', async () => {
      const alias = 'Acme Svg';
      await uploadFont('JetBrainsMono-Regular.woff2', alias);
      const draft = await seedTextDraft({ fontFamily: alias });

      const content = await callTool('export_svg', { draftId: draft });
      const svg = content[0]?.text ?? '';
      expect(svg).toContain('@font-face');
      expect(svg).toContain(`font-family: "${alias}"`);
      expect(svg).toContain('data:font/woff2;base64,');
      expect(svg).toContain("format('woff2')");
    });

    test('export_svg degrades to a comment when the family exceeds the embed budget', async () => {
      const alias = 'Acme Huge';
      // A valid sfnt with 4 MB of trailing padding: parses, registers, and blows the 3 MB budget
      // the MCP handler passes.
      const padded = Buffer.concat([fixture('JetBrainsMono-Regular.ttf'), Buffer.alloc(4_000_000)]);
      await uploadFont(padded, alias);
      const draft = await seedTextDraft({ fontFamily: alias });

      const content = await callTool('export_svg', { draftId: draft });
      const svg = content[0]?.text ?? '';
      expect(svg).toContain('exceeds embed size limit');
      expect(svg).toContain(alias);
      expect(svg).not.toContain('base64');
    });

    test('export_css carries the custom-font comment header (registry hydrated at the dispatch seam)', async () => {
      const alias = 'Acme Css';
      const uploaded = await uploadFont('JetBrainsMono-Regular.woff2', alias);
      const draft = await seedTextDraft({ fontFamily: alias });

      const content = await callTool('export_css', { draftId: draft });
      const css = content[0]?.text ?? '';
      expect(css).toContain(`Custom fonts required: "${alias}"`);
      expect(css).toContain('/storage/fonts/');
      expect(uploaded.data.variants).toHaveLength(1);
    });
  });
});
