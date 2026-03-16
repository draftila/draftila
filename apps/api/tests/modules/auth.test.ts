import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { cleanDatabase, createTestUser } from '../helpers';

describe('auth', () => {
  beforeEach(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    resetRateLimitStore('auth-general');
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
      const body = (await res.json()) as { user: { email: string; name: string } };
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
      const body = (await res.json()) as { token: string; user: { email: string } };
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

  describe('rate limiting', () => {
    test('sign-in returns 429 after 5 attempts', async () => {
      await createTestUser();

      for (let i = 0; i < 5; i++) {
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@draftila.com', password: 'wrong' }),
        });
        expect(res.status).not.toBe(429);
      }

      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@draftila.com', password: 'wrong' }),
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Too many requests');
      expect(res.headers.get('Retry-After')).toBeDefined();
    });

    test('sign-up returns 429 after 3 attempts', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `user${i}@draftila.com`,
            password: 'password123',
            name: `User ${i}`,
          }),
        });
        expect(res.status).not.toBe(429);
      }

      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'extra@draftila.com',
          password: 'password123',
          name: 'Extra User',
        }),
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Too many requests');
    });

    test('general auth POST returns 429 after 10 attempts', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request('/api/auth/some-other-endpoint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(res.status).not.toBe(429);
      }

      const res = await app.request('/api/auth/some-other-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Too many requests');
    });
  });

  describe('personal project', () => {
    test('sign-up automatically creates a personal project', async () => {
      const result = await createTestUser();
      const projects = await db.project.findMany({ where: { ownerId: result.user.id } });

      expect(projects).toHaveLength(1);
      expect(projects[0]!.name).toBe('Personal');
      expect(projects[0]!.isPersonal).toBe(true);
    });
  });

  describe('cascade deletes', () => {
    test('deleting a user cascades to sessions, accounts, projects, and drafts', async () => {
      const result = await createTestUser();
      const userId = result.user.id;

      const createdProject = await projectsService.create({
        name: 'Cascade Test',
        ownerId: userId,
      });
      await draftsService.create({ name: 'Cascade Draft', projectId: createdProject.id });

      const sessionsBefore = await db.session.findMany({ where: { userId } });
      const accountsBefore = await db.account.findMany({ where: { userId } });
      const projectsBefore = await db.project.findMany({ where: { ownerId: userId } });
      const draftsBefore = await db.draft.findMany({ where: { projectId: createdProject.id } });

      expect(sessionsBefore.length).toBeGreaterThan(0);
      expect(accountsBefore.length).toBeGreaterThan(0);
      expect(projectsBefore).toHaveLength(2);
      expect(draftsBefore).toHaveLength(1);

      await db.user.delete({ where: { id: userId } });

      const sessionsAfter = await db.session.findMany({ where: { userId } });
      const accountsAfter = await db.account.findMany({ where: { userId } });
      const projectsAfter = await db.project.findMany({ where: { ownerId: userId } });
      const draftsAfter = await db.draft.findMany({ where: { projectId: createdProject.id } });

      expect(sessionsAfter).toHaveLength(0);
      expect(accountsAfter).toHaveLength(0);
      expect(projectsAfter).toHaveLength(0);
      expect(draftsAfter).toHaveLength(0);
    });
  });
});
