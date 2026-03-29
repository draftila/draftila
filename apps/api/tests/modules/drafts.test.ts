import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { cleanDatabase, cleanDrafts, createTestUser, getAuthHeaders } from '../helpers';

describe('drafts', () => {
  let authHeaders: Headers;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    const result = await createTestUser();
    userId = result.user.id;
    authHeaders = await getAuthHeaders('test@draftila.com', 'password123');
    const proj = await projectsService.create({ name: 'Test Project', ownerId: userId });
    projectId = proj.id;
  });

  beforeEach(async () => {
    await cleanDrafts();
  });

  describe('drafts.service', () => {
    test('create returns the created draft', async () => {
      const draft = await draftsService.create({ name: 'My Draft', projectId });

      expect(draft.id).toBeDefined();
      expect(draft.name).toBe('My Draft');
      expect(draft.projectId).toBe(projectId);
    });

    test('listByProject returns only drafts for the given project', async () => {
      await draftsService.create({ name: 'D1', projectId });
      await draftsService.create({ name: 'D2', projectId });

      const result = await draftsService.listByProject(projectId);
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(
        result.data
          .map((d) => d.name)
          .slice()
          .sort(),
      ).toEqual(['D1', 'D2']);
    });

    test('listByProject returns empty array for project with no drafts', async () => {
      const result = await draftsService.listByProject(projectId);
      expect(result.data).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test('listByProject paginates with cursor and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await draftsService.create({ name: `D${i}`, projectId });
      }

      const page1 = await draftsService.listByProject(projectId, undefined, 3);
      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await draftsService.listByProject(projectId, page1.nextCursor!, 3);
      expect(page2.data).toHaveLength(2);
      expect(page2.nextCursor).toBeNull();

      const allNames = [...page1.data.map((d) => d.name), ...page2.data.map((d) => d.name)];
      expect(allNames).toHaveLength(5);
    });

    test('listByProject returns results ordered by updatedAt descending by default', async () => {
      await draftsService.create({ name: 'First', projectId });
      await draftsService.create({ name: 'Second', projectId });
      await draftsService.create({ name: 'Third', projectId });

      const result = await draftsService.listByProject(projectId);
      expect(result.data[0]!.name).toBe('Third');
      expect(result.data[2]!.name).toBe('First');
    });

    test('listByProject sorts by createdAt descending with last_created', async () => {
      await draftsService.create({ name: 'First', projectId });
      await draftsService.create({ name: 'Second', projectId });
      await draftsService.create({ name: 'Third', projectId });

      const result = await draftsService.listByProject(projectId, undefined, 20, 'last_created');
      expect(result.data[0]!.name).toBe('Third');
      expect(result.data[2]!.name).toBe('First');
    });

    test('listByProject sorts alphabetically with alphabetical', async () => {
      await draftsService.create({ name: 'Cherry', projectId });
      await draftsService.create({ name: 'Apple', projectId });
      await draftsService.create({ name: 'Banana', projectId });

      const result = await draftsService.listByProject(projectId, undefined, 20, 'alphabetical');
      expect(result.data[0]!.name).toBe('Apple');
      expect(result.data[1]!.name).toBe('Banana');
      expect(result.data[2]!.name).toBe('Cherry');
    });

    test('listByProject sorts by updatedAt descending with last_edited', async () => {
      const d1 = await draftsService.create({ name: 'First', projectId });
      await draftsService.create({ name: 'Second', projectId });
      await new Promise((r) => setTimeout(r, 50));
      await draftsService.update(d1.id, { name: 'First Updated' });

      const result = await draftsService.listByProject(projectId, undefined, 20, 'last_edited');
      expect(result.data[0]!.name).toBe('First Updated');
      expect(result.data[1]!.name).toBe('Second');
    });

    test('getById returns the draft', async () => {
      const created = await draftsService.create({ name: 'Find Me', projectId });
      const found = await draftsService.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
    });

    test('getById returns null for non-existent id', async () => {
      const found = await draftsService.getById('non-existent-id');
      expect(found).toBeNull();
    });

    test('update changes the draft name', async () => {
      const created = await draftsService.create({ name: 'Old Name', projectId });
      const updated = await draftsService.update(created.id, { name: 'New Name' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
    });

    test('update returns null for non-existent id', async () => {
      const updated = await draftsService.update('non-existent-id', { name: 'Nope' });
      expect(updated).toBeNull();
    });

    test('remove deletes the draft', async () => {
      const created = await draftsService.create({ name: 'Delete Me', projectId });
      const deleted = await draftsService.remove(created.id);

      expect(deleted).not.toBeNull();
      expect(deleted!.name).toBe('Delete Me');

      const found = await draftsService.getById(created.id);
      expect(found).toBeNull();
    });

    test('remove returns null for non-existent id', async () => {
      const deleted = await draftsService.remove('non-existent-id');
      expect(deleted).toBeNull();
    });

    test('listByOwner returns drafts across all projects', async () => {
      const project2 = await projectsService.create({ name: 'Second Project', ownerId: userId });
      await draftsService.create({ name: 'D1', projectId });
      await draftsService.create({ name: 'D2', projectId: project2.id });

      const result = await draftsService.listByUser(userId);
      expect(result.data).toHaveLength(2);
      expect(result.data.map((d) => d.name).sort()).toEqual(['D1', 'D2']);
    });

    test('listByOwner does not return drafts from other users', async () => {
      await draftsService.create({ name: 'My Draft', projectId });

      const result = await draftsService.listByUser('other-user-id');
      expect(result.data).toHaveLength(0);
    });

    test('listByOwner supports sorting', async () => {
      await draftsService.create({ name: 'Cherry', projectId });
      await draftsService.create({ name: 'Apple', projectId });
      await draftsService.create({ name: 'Banana', projectId });

      const result = await draftsService.listByUser(userId, undefined, 20, 'alphabetical');
      expect(result.data[0]!.name).toBe('Apple');
      expect(result.data[1]!.name).toBe('Banana');
      expect(result.data[2]!.name).toBe('Cherry');
    });

    test('listByOwner supports pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await draftsService.create({ name: `D${i}`, projectId });
      }

      const page1 = await draftsService.listByUser(userId, undefined, 3);
      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await draftsService.listByUser(userId, page1.nextCursor!, 3);
      expect(page2.data).toHaveLength(2);
      expect(page2.nextCursor).toBeNull();
    });

    test('getByIdForOwner returns draft for correct owner', async () => {
      const created = await draftsService.create({ name: 'Owned Draft', projectId });
      const result = await draftsService.getByIdForUser(created.id, userId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.name).toBe('Owned Draft');
    });

    test('getByIdForOwner returns null for wrong owner', async () => {
      const created = await draftsService.create({ name: 'Not Yours', projectId });
      const result = await draftsService.getByIdForUser(created.id, 'other-user-id');

      expect(result).toBeNull();
    });

    test('getByIdForOwner returns null for non-existent draft', async () => {
      const result = await draftsService.getByIdForUser('non-existent-id', userId);
      expect(result).toBeNull();
    });
  });

  describe('GET /api/drafts/:draftId route', () => {
    const draftUrl = (draftId: string) => `/api/drafts/${draftId}`;

    test('returns 401 without auth', async () => {
      const created = await draftsService.create({ name: 'Auth Test', projectId });
      const res = await app.request(draftUrl(created.id));
      expect(res.status).toBe(401);
    });

    test('returns the draft for the owner', async () => {
      const created = await draftsService.create({ name: 'My Draft', projectId });
      const res = await app.request(draftUrl(created.id), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { id: string; name: string; projectId: string };
      expect(body.id).toBe(created.id);
      expect(body.name).toBe('My Draft');
      expect(body.projectId).toBe(projectId);
    });

    test('returns 404 for non-existent draft', async () => {
      const res = await app.request(draftUrl('non-existent'), { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Draft not found');
    });

    test('returns 404 for draft owned by another user', async () => {
      const otherUser = await createTestUser({
        email: 'draft-owner-check@draftila.com',
        password: 'password123',
        name: 'Other Owner',
      });
      const otherProject = await projectsService.create({
        name: 'Other Owner Project',
        ownerId: otherUser.user.id,
      });
      const otherDraft = await draftsService.create({
        name: 'Not My Draft',
        projectId: otherProject.id,
      });

      const res = await app.request(draftUrl(otherDraft.id), { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Draft not found');
    });
  });

  describe('all drafts routes', () => {
    const allUrl = (query = '') => `/api/drafts${query}`;

    test('GET /api/drafts returns 401 without auth', async () => {
      const res = await app.request(allUrl());
      expect(res.status).toBe(401);
    });

    test('GET /api/drafts returns all drafts for the user', async () => {
      await draftsService.create({ name: 'Draft A', projectId });

      const res = await app.request(allUrl(), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[]; nextCursor: string | null };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.name).toBe('Draft A');
    });

    test('GET /api/drafts supports sort parameter', async () => {
      await draftsService.create({ name: 'Cherry', projectId });
      await draftsService.create({ name: 'Apple', projectId });

      const res = await app.request(allUrl('?sort=alphabetical'), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[] };
      expect(body.data[0]!.name).toBe('Apple');
      expect(body.data[1]!.name).toBe('Cherry');
    });

    test('GET /api/drafts returns 400 for invalid sort value', async () => {
      const res = await app.request(allUrl('?sort=invalid'), { headers: authHeaders });
      expect(res.status).toBe(400);
    });
  });

  describe('routes', () => {
    const url = (path = '') => `/api/projects/${projectId}/drafts${path}`;

    test('does not register a blanket middleware route on parameterized draft paths', () => {
      const hasParameterizedAllMiddleware = app.routes.some(
        (route) =>
          route.method === 'ALL' && route.path.startsWith('/api/projects/:projectId/drafts'),
      );

      expect(hasParameterizedAllMiddleware).toBe(false);
    });

    test('GET /drafts returns 401 without auth', async () => {
      const res = await app.request(url());
      expect(res.status).toBe(401);
    });

    test('GET /drafts returns drafts for authenticated user', async () => {
      await draftsService.create({ name: 'Route Draft', projectId });

      const res = await app.request(url(), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[]; nextCursor: string | null };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.name).toBe('Route Draft');
      expect(body.nextCursor).toBeNull();
    });

    test('GET /drafts supports cursor-based pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await draftsService.create({ name: `Draft ${i}`, projectId });
      }

      const res1 = await app.request(url('?limit=3'), { headers: authHeaders });
      expect(res1.status).toBe(200);
      const page1 = (await res1.json()) as {
        data: { name: string }[];
        nextCursor: string | null;
      };
      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const res2 = await app.request(url(`?limit=3&cursor=${page1.nextCursor}`), {
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

    test('GET /drafts supports sort parameter', async () => {
      await draftsService.create({ name: 'Cherry', projectId });
      await draftsService.create({ name: 'Apple', projectId });
      await draftsService.create({ name: 'Banana', projectId });

      const res = await app.request(url('?sort=alphabetical'), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[] };
      expect(body.data[0]!.name).toBe('Apple');
      expect(body.data[1]!.name).toBe('Banana');
      expect(body.data[2]!.name).toBe('Cherry');
    });

    test('GET /drafts returns 400 for invalid sort value', async () => {
      const res = await app.request(url('?sort=invalid'), { headers: authHeaders });
      expect(res.status).toBe(400);
    });

    test('GET /drafts defaults to last_edited sort', async () => {
      const d1 = await draftsService.create({ name: 'First', projectId });
      await draftsService.create({ name: 'Second', projectId });
      await new Promise((r) => setTimeout(r, 50));
      await draftsService.update(d1.id, { name: 'First Updated' });

      const res = await app.request(url(), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { data: { name: string }[] };
      expect(body.data[0]!.name).toBe('First Updated');
    });

    test('GET /drafts returns 400 for invalid limit', async () => {
      const res = await app.request(url('?limit=0'), { headers: authHeaders });
      expect(res.status).toBe(400);
    });

    test('GET /drafts returns 404 for non-existent project', async () => {
      const res = await app.request('/api/projects/non-existent/drafts', {
        headers: authHeaders,
      });
      expect(res.status).toBe(404);
    });

    test('GET /drafts returns 404 for another users project', async () => {
      const otherUser = await createTestUser({
        email: 'draft-other@draftila.com',
        password: 'password123',
        name: 'Other User',
      });
      const otherProject = await projectsService.create({
        name: 'Other Project',
        ownerId: otherUser.user.id,
      });

      const res = await app.request(`/api/projects/${otherProject.id}/drafts`, {
        headers: authHeaders,
      });
      expect(res.status).toBe(404);
    });

    test('POST /drafts creates a draft', async () => {
      const res = await app.request(url(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'New Draft' }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { name: string; projectId: string };
      expect(body.name).toBe('New Draft');
      expect(body.projectId).toBe(projectId);
    });

    test('POST /drafts returns 400 for invalid body', async () => {
      const res = await app.request(url(), {
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

    test('POST /drafts returns 400 for empty name', async () => {
      const res = await app.request(url(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /drafts returns 400 for whitespace-only name', async () => {
      const res = await app.request(url(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: '   ' }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /drafts returns 400 for name exceeding max length', async () => {
      const res = await app.request(url(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'a'.repeat(256) }),
      });

      expect(res.status).toBe(400);
    });

    test('POST /drafts returns 400 for malformed JSON', async () => {
      const res = await app.request(url(), {
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

    test('POST /drafts returns 404 for non-existent project', async () => {
      const res = await app.request('/api/projects/non-existent/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'Orphan Draft' }),
      });

      expect(res.status).toBe(403);
    });

    test('POST /drafts/import returns 400 for invalid component shapes JSON', async () => {
      const invalidImport = {
        version: 1,
        exportedAt: new Date().toISOString(),
        generator: 'draftila',
        draft: {
          name: 'Imported Draft',
          pages: [
            {
              id: 'page-1',
              name: 'Page 1',
              backgroundColor: '#ffffff',
              shapes: [],
              zOrder: [],
            },
          ],
          pageOrder: ['page-1'],
          variables: [],
          components: [
            {
              id: 'component-1',
              name: 'Component 1',
              shapes: '{"id": "shape-1"}',
            },
          ],
          componentInstances: {},
        },
      };

      const formData = new FormData();
      formData.append(
        'file',
        new File([JSON.stringify(invalidImport)], 'invalid.draftila.json', {
          type: 'application/json',
        }),
      );

      const res = await app.request(url('/import'), {
        method: 'POST',
        headers: { Cookie: authHeaders.get('Cookie')! },
        body: formData,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(body.error).toBe('Validation failed');
      const fileErrors = body.fieldErrors.file;
      expect(fileErrors).toBeDefined();
      expect(fileErrors?.some((message) => message.includes('Invalid draft file format'))).toBe(
        true,
      );
    });

    test('POST /drafts/import returns 401 without auth', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'test.json', { type: 'application/json' }));
      const res = await app.request(url('/import'), { method: 'POST', body: formData });
      expect(res.status).toBe(401);
    });

    test('POST /drafts/import creates a draft from a valid export file', async () => {
      const validImport = {
        version: 1,
        exportedAt: new Date().toISOString(),
        generator: 'draftila',
        draft: {
          name: 'Imported Draft',
          pages: [
            {
              id: 'page-1',
              name: 'Page 1',
              backgroundColor: '#ffffff',
              shapes: [],
              zOrder: [],
            },
          ],
          pageOrder: ['page-1'],
          variables: [],
          components: [],
          componentInstances: {},
        },
      };

      const formData = new FormData();
      formData.append(
        'file',
        new File([JSON.stringify(validImport)], 'valid.draftila.json', {
          type: 'application/json',
        }),
      );

      const res = await app.request(url('/import'), {
        method: 'POST',
        headers: { Cookie: authHeaders.get('Cookie')! },
        body: formData,
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; name: string; projectId: string };
      expect(body.name).toBe('Imported Draft');
      expect(body.projectId).toBe(projectId);
      expect(body.id).toBeDefined();
    });

    test('GET /drafts/:draftId/export returns 401 without auth', async () => {
      const res = await app.request(url('/some-id/export'));
      expect(res.status).toBe(401);
    });

    test('GET /drafts/:draftId/export returns the draft export', async () => {
      const draft = await draftsService.create({ name: 'Export Me', projectId });

      const res = await app.request(url(`/${draft.id}/export`), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        version: number;
        generator: string;
        draft: { name: string };
      };
      expect(body.version).toBe(1);
      expect(body.generator).toBe('draftila');
      expect(body.draft.name).toBe('Export Me');
    });

    test('GET /drafts/:draftId/export returns 404 for non-existent draft', async () => {
      const res = await app.request(url('/non-existent/export'), { headers: authHeaders });
      expect(res.status).toBe(404);
    });

    test('GET /drafts/export-all returns 401 without auth', async () => {
      const res = await app.request(url('/export-all'));
      expect(res.status).toBe(401);
    });

    test('GET /drafts/export-all returns empty when no drafts exist', async () => {
      const res = await app.request(url('/export-all'), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { exports: unknown[] };
      expect(body.exports).toEqual([]);
    });

    test('GET /drafts/export-all returns single draft as JSON', async () => {
      await draftsService.create({ name: 'Only Draft', projectId });

      const res = await app.request(url('/export-all'), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        version: number;
        generator: string;
        draft: { name: string };
      };
      expect(body.version).toBe(1);
      expect(body.draft.name).toBe('Only Draft');
    });

    test('GET /drafts/export-all returns zip for multiple drafts', async () => {
      await draftsService.create({ name: 'Draft A', projectId });
      await draftsService.create({ name: 'Draft B', projectId });

      const res = await app.request(url('/export-all'), { headers: authHeaders });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/zip');
    });

    test('GET /drafts/:draftId returns the draft', async () => {
      const draft = await draftsService.create({ name: 'Get By Id', projectId });

      const res = await app.request(url(`/${draft.id}`), { headers: authHeaders });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { name: string };
      expect(body.name).toBe('Get By Id');
    });

    test('GET /drafts/:draftId returns 404 for non-existent draft', async () => {
      const res = await app.request(url('/non-existent'), { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Draft not found');
    });

    test('GET /drafts/:draftId returns 404 for draft in another project', async () => {
      const otherProject = await projectsService.create({
        name: 'Other Project 2',
        ownerId: userId,
      });
      const draft = await draftsService.create({
        name: 'Wrong Project',
        projectId: otherProject.id,
      });

      const res = await app.request(url(`/${draft.id}`), { headers: authHeaders });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Draft not found');
    });

    test('PATCH /drafts/:draftId updates the draft name', async () => {
      const draft = await draftsService.create({ name: 'Old Name', projectId });

      const res = await app.request(url(`/${draft.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe('Updated Name');
    });

    test('PATCH /drafts/:draftId returns 404 for non-existent draft', async () => {
      const res = await app.request(url('/non-existent'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'Nope' }),
      });

      expect(res.status).toBe(404);
    });

    test('PATCH /drafts/:draftId returns 400 for invalid body', async () => {
      const draft = await draftsService.create({ name: 'Valid', projectId });

      const res = await app.request(url(`/${draft.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });

    test('PATCH /drafts/:draftId returns 404 for draft in another project', async () => {
      const otherProject = await projectsService.create({
        name: 'Other Project 3',
        ownerId: userId,
      });
      const draft = await draftsService.create({
        name: 'Wrong Project',
        projectId: otherProject.id,
      });

      const res = await app.request(url(`/${draft.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authHeaders.get('Cookie')!,
        },
        body: JSON.stringify({ name: 'Nope' }),
      });

      expect(res.status).toBe(404);
    });

    test('DELETE /drafts/:draftId deletes the draft', async () => {
      const draft = await draftsService.create({ name: 'To Delete', projectId });

      const res = await app.request(url(`/${draft.id}`), {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      const found = await draftsService.getById(draft.id);
      expect(found).toBeNull();
    });

    test('DELETE /drafts/:draftId returns 404 for non-existent draft', async () => {
      const res = await app.request(url('/non-existent'), {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
    });

    test('DELETE /drafts/:draftId returns 401 without auth', async () => {
      const res = await app.request(url('/some-id'), { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    test('DELETE /drafts/:draftId returns 404 for draft in another project', async () => {
      const otherProject = await projectsService.create({
        name: 'Other Project 4',
        ownerId: userId,
      });
      const draft = await draftsService.create({
        name: 'Wrong Project',
        projectId: otherProject.id,
      });

      const res = await app.request(url(`/${draft.id}`), {
        method: 'DELETE',
        headers: authHeaders,
      });

      expect(res.status).toBe(404);
    });
  });
});
