import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as userService from '../../src/modules/user/user.service';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

describe('user', () => {
  beforeEach(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
  });

  describe('user.service', () => {
    test('getById returns the user for a valid id', async () => {
      const result = await createTestUser();
      const found = await userService.getById(result.user.id);

      expect(found).not.toBeNull();
      expect(found!.email).toBe('test@draftila.com');
      expect(found!.name).toBe('Test User');
    });

    test('getById returns null for a non-existent id', async () => {
      const found = await userService.getById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('GET /api/me', () => {
    test('returns 401 without auth', async () => {
      const res = await app.request('/api/me');
      expect(res.status).toBe(401);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Unauthorized');
    });

    test('returns user with valid session', async () => {
      await createTestUser();
      const headers = await getAuthHeaders('test@draftila.com', 'password123');

      const res = await app.request('/api/me', { headers });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        user: { id: string; email: string; name: string; image: string | null };
      };
      expect(body.user.email).toBe('test@draftila.com');
      expect(body.user.name).toBe('Test User');
      expect(Object.keys(body.user).sort()).toEqual(['email', 'id', 'image', 'name']);
    });

    test('returns 401 with invalid session token', async () => {
      const headers = new Headers();
      headers.set('Cookie', 'better-auth.session_token=invalid-token');

      const res = await app.request('/api/me', { headers });
      expect(res.status).toBe(401);
    });
  });
});
