import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../src/app';
import { authenticateMcpToken, createMcpToken } from '../../../src/modules/mcp/mcp-token.service';
import { type McpTestContext, setupMcpTests, resetMcpState } from './mcp-helpers';

describe('mcp management routes', () => {
  let ctx: McpTestContext;

  beforeAll(async () => {
    ctx = await setupMcpTests();
  });

  beforeEach(async () => {
    await resetMcpState(ctx.draftId);
  });

  test('GET /api/mcp/tokens returns 401 without session', async () => {
    const res = await app.request('/api/mcp/tokens');
    expect(res.status).toBe(401);
  });

  test('POST /api/mcp/tokens creates token with default 90 days', async () => {
    const res = await app.request('/api/mcp/tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ctx.authHeaders.get('Cookie')!,
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
      ownerId: ctx.userId,
      name: 'Listed Token',
      scopes: ['mcp:projects:read'],
      expiresInDays: 30,
    });

    const res = await app.request('/api/mcp/tokens', { headers: ctx.authHeaders });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.name).toBe('Listed Token');
  });

  test('POST /api/mcp/tokens/:id/revoke revokes token', async () => {
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Revokable',
      scopes: ['mcp:projects:read'],
      expiresInDays: 30,
    });

    const res = await app.request(`/api/mcp/tokens/${created.token.id}/revoke`, {
      method: 'POST',
      headers: ctx.authHeaders,
    });

    expect(res.status).toBe(200);
    const auth = await authenticateMcpToken(created.secret);
    expect(auth).toBeNull();
  });
});
