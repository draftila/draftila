import { afterEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

describe('auth', () => {
  afterEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/auth/sign-up/email', () => {
    test('creates a new user', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@draftila.com',
          password: 'password123',
          name: 'New User',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe('new@draftila.com');
      expect(body.user.name).toBe('New User');
    });

    test('rejects duplicate email', async () => {
      await createTestUser({ email: 'dup@draftila.com', password: 'password123', name: 'First' });

      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'dup@draftila.com',
          password: 'password123',
          name: 'Second',
        }),
      });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/auth/sign-in/email', () => {
    test('returns session for valid credentials', async () => {
      await createTestUser();
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@draftila.com',
          password: 'password123',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe('test@draftila.com');
    });

    test('rejects invalid password', async () => {
      await createTestUser();
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@draftila.com',
          password: 'wrongpassword',
        }),
      });

      expect(res.status).not.toBe(200);
    });

    test('rejects non-existent email', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nobody@draftila.com',
          password: 'password123',
        }),
      });

      expect(res.status).not.toBe(200);
    });
  });

  describe('GET /api/me', () => {
    test('returns 401 without auth', async () => {
      const res = await app.request('/api/me');
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('returns user with valid session', async () => {
      await createTestUser();
      const headers = await getAuthHeaders('test@draftila.com', 'password123');

      const res = await app.request('/api/me', { headers });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.user.email).toBe('test@draftila.com');
      expect(body.user.name).toBe('Test User');
    });

    test('returns 401 with invalid session token', async () => {
      const headers = new Headers();
      headers.set('Cookie', 'better-auth.session_token=invalid-token');

      const res = await app.request('/api/me', { headers });
      expect(res.status).toBe(401);
    });
  });
});
