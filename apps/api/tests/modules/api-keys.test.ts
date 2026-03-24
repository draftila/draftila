import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import { cleanApiKeys, cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

describe('api-keys', () => {
  let authHeaders: Headers;
  let userId: string;

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    const result = await createTestUser();
    userId = result.user.id;
    authHeaders = await getAuthHeaders('test@draftila.com', 'password123');
  });

  beforeEach(async () => {
    await cleanApiKeys();
  });

  describe('api-keys.service', () => {
    test('create returns id, name, and raw key with dk_ prefix', async () => {
      const result = await apiKeysService.create(userId, 'Test Key');

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Key');
      expect(result.key).toStartWith('dk_');
      expect(result.key.length).toBeGreaterThan(10);
    });

    test('create stores a SHA-256 hash, not the raw key', async () => {
      const result = await apiKeysService.create(userId, 'Hash Check');
      const stored = await db.apiKey.findUnique({ where: { id: result.id } });

      expect(stored).not.toBeNull();
      expect(stored!.keyHash).not.toBe(result.key);
      expect(stored!.keyHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('verifyKey returns userId for a valid key', async () => {
      const { key } = await apiKeysService.create(userId, 'Verify Me');
      const result = await apiKeysService.verifyKey(key);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(userId);
    });

    test('verifyKey returns null for an invalid key', async () => {
      const result = await apiKeysService.verifyKey('dk_invalid_key_that_does_not_exist');
      expect(result).toBeNull();
    });

    test('verifyKey returns null for a key without dk_ prefix', async () => {
      const result = await apiKeysService.verifyKey('no_prefix_key');
      expect(result).toBeNull();
    });

    test('verifyKey updates lastUsedAt', async () => {
      const { key, id } = await apiKeysService.create(userId, 'Usage Track');

      const before = await db.apiKey.findUnique({ where: { id } });
      expect(before!.lastUsedAt).toBeNull();

      await apiKeysService.verifyKey(key);
      await new Promise((r) => setTimeout(r, 50));

      const after = await db.apiKey.findUnique({ where: { id } });
      expect(after!.lastUsedAt).not.toBeNull();
    });

    test('listByUser returns only keys for the given user', async () => {
      await apiKeysService.create(userId, 'Key 1');
      await apiKeysService.create(userId, 'Key 2');

      const keys = await apiKeysService.listByUser(userId);
      expect(keys).toHaveLength(2);
      const names = keys.map((k) => k.name).sort();
      expect(names).toEqual(['Key 1', 'Key 2']);
    });

    test('listByUser does not expose keyHash', async () => {
      await apiKeysService.create(userId, 'Secret Key');
      const keys = await apiKeysService.listByUser(userId);

      expect(keys[0]).not.toHaveProperty('keyHash');
    });

    test('remove deletes the key', async () => {
      const { id } = await apiKeysService.create(userId, 'Delete Me');
      const result = await apiKeysService.remove(id, userId);

      expect(result).not.toBeNull();
      const found = await db.apiKey.findUnique({ where: { id } });
      expect(found).toBeNull();
    });

    test('remove returns null for non-existent key', async () => {
      const result = await apiKeysService.remove('nonexistent', userId);
      expect(result).toBeNull();
    });

    test('remove returns null when userId does not match', async () => {
      const { id } = await apiKeysService.create(userId, 'Not Mine');
      const result = await apiKeysService.remove(id, 'different-user-id');
      expect(result).toBeNull();
    });

    test('create enforces max 20 keys per user', async () => {
      for (let i = 0; i < 20; i++) {
        await apiKeysService.create(userId, `Key ${i}`);
      }

      await expect(apiKeysService.create(userId, 'Key 21')).rejects.toThrow('Maximum of 20');
    });
  });

  describe('api-keys.routes', () => {
    test('POST /api/api-keys creates a key and returns 201', async () => {
      const res = await app.request('/api/api-keys', {
        method: 'POST',
        headers: { ...Object.fromEntries(authHeaders), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Key' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; name: string; key: string };
      expect(body.id).toBeDefined();
      expect(body.name).toBe('My Key');
      expect(body.key).toStartWith('dk_');
    });

    test('POST /api/api-keys returns 400 for empty name', async () => {
      const res = await app.request('/api/api-keys', {
        method: 'POST',
        headers: { ...Object.fromEntries(authHeaders), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /api/api-keys returns 401 without auth', async () => {
      const res = await app.request('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthed' }),
      });

      expect(res.status).toBe(401);
    });

    test('GET /api/api-keys lists keys', async () => {
      await apiKeysService.create(userId, 'Listed Key');

      const res = await app.request('/api/api-keys', {
        method: 'GET',
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.name).toBe('Listed Key');
    });

    test('DELETE /api/api-keys/:id removes a key', async () => {
      const { id } = await apiKeysService.create(userId, 'Delete Via Route');

      const res = await app.request(`/api/api-keys/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      const found = await db.apiKey.findUnique({ where: { id } });
      expect(found).toBeNull();
    });

    test('DELETE /api/api-keys/:id returns 404 for non-existent key', async () => {
      const res = await app.request('/api/api-keys/nonexistent', {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
    });
  });
});
