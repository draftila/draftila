import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as projectsService from '../../src/modules/projects/projects.service';
import { cleanDatabase, cleanProjects, createTestUser, getAuthHeaders } from '../helpers';

describe('projects', () => {
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
    await cleanProjects();
  });

  describe('projects.service', () => {
    test('create returns the created project', async () => {
      const project = await projectsService.create({ name: 'My Project', ownerId: userId });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('My Project');
      expect(project.isPersonal).toBe(false);
      expect(project.ownerId).toBe(userId);
    });

    test('listByOwner returns only the owner projects', async () => {
      await projectsService.create({ name: 'P1', ownerId: userId });
      await projectsService.create({ name: 'P2', ownerId: userId });

      const result = await projectsService.listByOwner(userId);
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(
        result.data
          .map((p) => p.name)
          .slice()
          .sort(),
      ).toEqual(['P1', 'P2']);
    });

    test('listByOwner returns empty array for user with no projects', async () => {
      const result = await projectsService.listByOwner(userId);
      expect(result.data).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test('listByOwner paginates with cursor and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await projectsService.create({ name: `P${i}`, ownerId: userId });
      }

      const page1 = await projectsService.listByOwner(userId, undefined, 3);
      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await projectsService.listByOwner(userId, page1.nextCursor!, 3);
      expect(page2.data).toHaveLength(2);
      expect(page2.nextCursor).toBeNull();

      const allNames = [...page1.data.map((p) => p.name), ...page2.data.map((p) => p.name)];
      expect(allNames).toHaveLength(5);
    });

    test('listByOwner returns results ordered by updatedAt descending by default', async () => {
      await projectsService.create({ name: 'First', ownerId: userId });
      await projectsService.create({ name: 'Second', ownerId: userId });
      await projectsService.create({ name: 'Third', ownerId: userId });

      const result = await projectsService.listByOwner(userId);
      expect(result.data[0]!.name).toBe('Third');
      expect(result.data[2]!.name).toBe('First');
    });

    test('listByOwner sorts by createdAt descending with last_created', async () => {
      await projectsService.create({ name: 'First', ownerId: userId });
      await projectsService.create({ name: 'Second', ownerId: userId });
      await projectsService.create({ name: 'Third', ownerId: userId });

      const result = await projectsService.listByOwner(userId, undefined, 20, 'last_created');
      expect(result.data[0]!.name).toBe('Third');
      expect(result.data[2]!.name).toBe('First');
    });

    test('listByOwner sorts alphabetically with alphabetical', async () => {
      await projectsService.create({ name: 'Cherry', ownerId: userId });
      await projectsService.create({ name: 'Apple', ownerId: userId });
      await projectsService.create({ name: 'Banana', ownerId: userId });

      const result = await projectsService.listByOwner(userId, undefined, 20, 'alphabetical');
      expect(result.data[0]!.name).toBe('Apple');
      expect(result.data[1]!.name).toBe('Banana');
      expect(result.data[2]!.name).toBe('Cherry');
    });

    test('getByIdForUser returns the project for the correct owner', async () => {
      const created = await projectsService.create({ name: 'Find Me', ownerId: userId });
      const found = await projectsService.getByIdForUser(created.id, userId);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
    });

    test('getByIdForUser returns null for non-existent id', async () => {
      const found = await projectsService.getByIdForUser('non-existent-id', userId);
      expect(found).toBeNull();
    });

    test('getByIdForUser returns null for wrong owner', async () => {
      const created = await projectsService.create({ name: 'Private', ownerId: userId });
      const found = await projectsService.getByIdForUser(created.id, 'other-user-id');
      expect(found).toBeNull();
    });

    test('remove deletes the project for the correct owner', async () => {
      const created = await projectsService.create({ name: 'Delete Me', ownerId: userId });
      const deleted = await projectsService.remove(created.id, userId);

      expect(deleted).not.toBeNull();
      expect(deleted!.name).toBe('Delete Me');

      const found = await projectsService.getByIdForUser(created.id, userId);
      expect(found).toBeNull();
    });

    test('remove returns null for wrong owner', async () => {
      const created = await projectsService.create({ name: 'Protected', ownerId: userId });
      const deleted = await projectsService.remove(created.id, 'other-user-id');

      expect(deleted).toBeNull();

      const found = await projectsService.getByIdForUser(created.id, userId);
      expect(found).not.toBeNull();
    });

    test('remove throws ForbiddenError for personal project', async () => {
      const created = await projectsService.create({ name: 'Personal', ownerId: userId });
      await db.project.update({ where: { id: created.id }, data: { isPersonal: true } });

      await expect(projectsService.remove(created.id, userId)).rejects.toThrow('Forbidden');

      const found = await projectsService.getByIdForUser(created.id, userId);
      expect(found).not.toBeNull();
    });
  });

  describe('routes', () => {
    test('GET /api/projects returns 401 without auth', async () => {
      const res = await app.request('/api/projects');
      expect(res.status).toBe(401);
    });

    test('GET /api/projects returns projects for authenticated user', async () => {
      await projectsService.create({ name: 'Route Project', ownerId: userId });

      const res = await app.request('/api/projects', { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[]; nextCursor: string | null };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.name).toBe('Route Project');
      expect(body.nextCursor).toBeNull();
    });

    test('GET /api/projects supports cursor-based pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await projectsService.create({ name: `Project ${i}`, ownerId: userId });
      }

      const res1 = await app.request('/api/projects?limit=3', { headers: authHeaders });
      expect(res1.status).toBe(200);
      const page1 = (await res1.json()) as {
        data: { name: string }[];
        nextCursor: string | null;
      };
      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const res2 = await app.request(`/api/projects?limit=3&cursor=${page1.nextCursor}`, {
        headers: authHeaders,
      });
      expect(res2.status).toBe(200);
      const page2 = (await res2.json()) as {
        data: { name: string }[];
        nextCursor: string | null;
      };
      expect(page2.data).toHaveLength(2);
      expect(page2.nextCursor).toBeNull();
    });

    test('GET /api/projects supports sort parameter', async () => {
      await projectsService.create({ name: 'Cherry', ownerId: userId });
      await projectsService.create({ name: 'Apple', ownerId: userId });
      await projectsService.create({ name: 'Banana', ownerId: userId });

      const res = await app.request('/api/projects?sort=alphabetical', { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[] };
      expect(body.data[0]!.name).toBe('Apple');
      expect(body.data[1]!.name).toBe('Banana');
      expect(body.data[2]!.name).toBe('Cherry');
    });

    test('GET /api/projects returns 400 for invalid sort value', async () => {
      const res = await app.request('/api/projects?sort=invalid', { headers: authHeaders });
      expect(res.status).toBe(400);
    });

    test('GET /api/projects returns 400 for invalid limit', async () => {
      const res = await app.request('/api/projects?limit=0', { headers: authHeaders });
      expect(res.status).toBe(400);
    });

    test('GET /api/projects returns 400 for limit exceeding max', async () => {
      const res = await app.request('/api/projects?limit=101', { headers: authHeaders });
      expect(res.status).toBe(400);
    });

    test('POST /api/projects creates a project', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'New Project' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { name: string; ownerId: string };
      expect(body.name).toBe('New Project');
      expect(body.ownerId).toBe(userId);
    });

    test('POST /api/projects returns 400 for invalid body', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; fieldErrors: Record<string, string[]> };
      expect(body.error).toBe('Validation failed');
      expect(body.fieldErrors).toBeDefined();
    });

    test('POST /api/projects returns 400 for empty name', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /api/projects returns 400 for whitespace-only name', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: '   ' }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /api/projects returns 400 for name exceeding max length', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'a'.repeat(256) }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /api/projects returns 400 for malformed JSON', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: 'not json{{',
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid JSON');
    });

    test('GET /api/projects/:id returns the project', async () => {
      const project = await projectsService.create({ name: 'Get By Id', ownerId: userId });

      const res = await app.request(`/api/projects/${project.id}`, { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe('Get By Id');
    });

    test('GET /api/projects/:id returns 404 for non-existent project', async () => {
      const res = await app.request('/api/projects/non-existent', { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Project not found');
    });

    test('GET /api/projects/:id returns 404 for another users project', async () => {
      const otherUser = await createTestUser({
        email: 'other@draftila.com',
        password: 'password123',
        name: 'Other User',
      });
      const project = await projectsService.create({
        name: 'Private Project',
        ownerId: otherUser.user.id,
      });

      const res = await app.request(`/api/projects/${project.id}`, { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Project not found');
    });

    test('DELETE /api/projects/:id deletes the project', async () => {
      const project = await projectsService.create({ name: 'To Delete', ownerId: userId });

      const res = await app.request(`/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      const found = await projectsService.getByIdForUser(project.id, userId);
      expect(found).toBeNull();
    });

    test('DELETE /api/projects/:id returns 404 for another users project', async () => {
      const otherUser = await createTestUser({
        email: 'other-delete@draftila.com',
        password: 'password123',
        name: 'Other User',
      });
      const project = await projectsService.create({
        name: 'Not Yours',
        ownerId: otherUser.user.id,
      });

      const res = await app.request(`/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(404);

      const found = await projectsService.getByIdForUser(project.id, otherUser.user.id);
      expect(found).not.toBeNull();
    });

    test('DELETE /api/projects/:id returns 404 for non-existent project', async () => {
      const res = await app.request('/api/projects/non-existent', {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
    });

    test('DELETE /api/projects/:id returns 401 without auth', async () => {
      const res = await app.request('/api/projects/some-id', { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    test('DELETE /api/projects/:id returns 403 for personal project', async () => {
      const created = await projectsService.create({ name: 'Personal', ownerId: userId });
      await db.project.update({ where: { id: created.id }, data: { isPersonal: true } });

      const res = await app.request(`/api/projects/${created.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Forbidden');

      const found = await projectsService.getByIdForUser(created.id, userId);
      expect(found).not.toBeNull();
    });
  });
});
