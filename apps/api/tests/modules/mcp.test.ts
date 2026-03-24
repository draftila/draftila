import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import * as collaborationService from '../../src/modules/collaboration/collaboration.service';
import { cleanApiKeys, cleanDatabase, createTestUser } from '../helpers';

describe('mcp', () => {
  let userId: string;
  let validApiKey: string;

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    const result = await createTestUser();
    userId = result.user.id;
  });

  beforeEach(async () => {
    await cleanApiKeys();
    resetRateLimitStore('mcp');
    const { key } = await apiKeysService.create(userId, 'MCP Test Key');
    validApiKey = key;
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
});
