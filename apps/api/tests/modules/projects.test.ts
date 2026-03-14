import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import * as projectsService from '../../src/modules/projects/projects.service';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

describe('projects', () => {
  let authHeaders: Headers;
  let userId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const result = await createTestUser();
    userId = result.user.id;
    authHeaders = await getAuthHeaders('test@draftila.com', 'password123');
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  // ── Service tests ───────────────────────────────────────────────────────

  describe('projects.service', () => {
    test('create returns the created project', async () => {
      const project = await projectsService.create({ name: 'My Project', ownerId: userId });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('My Project');
      expect(project.ownerId).toBe(userId);
    });

    test('listByOwner returns only the owner projects', async () => {
      await projectsService.create({ name: 'P1', ownerId: userId });
      await projectsService.create({ name: 'P2', ownerId: userId });

      const projects = await projectsService.listByOwner(userId);
      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.name).sort()).toEqual(['P1', 'P2']);
    });

    test('listByOwner returns empty array for user with no projects', async () => {
      const projects = await projectsService.listByOwner(userId);
      expect(projects).toEqual([]);
    });

    test('getById returns the project', async () => {
      const created = await projectsService.create({ name: 'Find Me', ownerId: userId });
      const found = await projectsService.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
    });

    test('getById returns null for non-existent id', async () => {
      const found = await projectsService.getById('non-existent-id');
      expect(found).toBeNull();
    });

    test('remove deletes the project', async () => {
      const created = await projectsService.create({ name: 'Delete Me', ownerId: userId });
      await projectsService.remove(created.id);

      const found = await projectsService.getById(created.id);
      expect(found).toBeNull();
    });
  });

  // ── Route tests ─────────────────────────────────────────────────────────

  describe('routes', () => {
    test('GET /api/projects returns 401 without auth', async () => {
      const res = await app.request('/api/projects');
      expect(res.status).toBe(401);
    });

    test('GET /api/projects returns projects for authenticated user', async () => {
      await projectsService.create({ name: 'Route Project', ownerId: userId });

      const res = await app.request('/api/projects', { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('Route Project');
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
      const body = await res.json();
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
      const body = await res.json();
      expect(body.error).toBeDefined();
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

    test('GET /api/projects/:id returns the project', async () => {
      const project = await projectsService.create({ name: 'Get By Id', ownerId: userId });

      const res = await app.request(`/api/projects/${project.id}`, { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.name).toBe('Get By Id');
    });

    test('GET /api/projects/:id returns 404 for non-existent project', async () => {
      const res = await app.request('/api/projects/non-existent', { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Project not found');
    });

    test('DELETE /api/projects/:id deletes the project', async () => {
      const project = await projectsService.create({ name: 'To Delete', ownerId: userId });

      const res = await app.request(`/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify deletion
      const found = await projectsService.getById(project.id);
      expect(found).toBeNull();
    });

    test('DELETE /api/projects/:id returns 401 without auth', async () => {
      const res = await app.request('/api/projects/some-id', { method: 'DELETE' });
      expect(res.status).toBe(401);
    });
  });
});
