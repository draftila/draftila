import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import { nanoid } from '../../src/common/lib/utils';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { cleanDatabase, cleanDrafts, createTestUser, getAuthHeaders } from '../helpers';

describe('comments', () => {
  let ownerHeaders: Headers;
  let memberHeaders: Headers;
  let ownerId: string;
  let memberId: string;
  let projectId: string;
  let draftId: string;
  const pageId = 'page-1';

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');

    const owner = await createTestUser({
      email: 'comments-owner@draftila.com',
      password: 'password123',
      name: 'Owner',
    });
    ownerId = owner.user.id;
    ownerHeaders = await getAuthHeaders('comments-owner@draftila.com', 'password123');

    const member = await createTestUser({
      email: 'comments-member@draftila.com',
      password: 'password123',
      name: 'Member',
    });
    memberId = member.user.id;
    memberHeaders = await getAuthHeaders('comments-member@draftila.com', 'password123');

    const project = await projectsService.create({ name: 'Comments Project', ownerId });
    projectId = project.id;

    await db.projectMember.create({
      data: {
        id: nanoid(),
        projectId,
        userId: memberId,
        role: 'editor',
      },
    });
  });

  beforeEach(async () => {
    await cleanDrafts();
    const draft = await draftsService.create({ name: 'Comments Draft', projectId });
    draftId = draft.id;
  });

  test('requires auth for listing comments', async () => {
    const res = await app.request(`/api/drafts/${draftId}/comments?pageId=${pageId}`);
    expect(res.status).toBe(401);
  });

  test('creates and lists top-level comments', async () => {
    const createRes = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerHeaders.get('Cookie')!,
      },
      body: JSON.stringify({ pageId, content: 'Top level comment' }),
    });

    expect(createRes.status).toBe(201);

    const listRes = await app.request(`/api/drafts/${draftId}/comments?pageId=${pageId}`, {
      headers: ownerHeaders,
    });

    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as Array<{ content: string; replies: unknown[] }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.content).toBe('Top level comment');
    expect(body[0]!.replies).toHaveLength(0);
  });

  test('supports threaded replies', async () => {
    const topRes = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerHeaders.get('Cookie')!,
      },
      body: JSON.stringify({ pageId, content: 'Root thread' }),
    });

    const top = (await topRes.json()) as { id: string };

    const replyRes = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: memberHeaders.get('Cookie')!,
      },
      body: JSON.stringify({ pageId, content: 'Reply 1', parentId: top.id }),
    });

    expect(replyRes.status).toBe(201);

    const listRes = await app.request(`/api/drafts/${draftId}/comments?pageId=${pageId}`, {
      headers: ownerHeaders,
    });
    const body = (await listRes.json()) as Array<{
      id: string;
      replies: Array<{ content: string }>;
    }>;

    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe(top.id);
    expect(body[0]!.replies).toHaveLength(1);
    expect(body[0]!.replies[0]!.content).toBe('Reply 1');
  });

  test('toggles resolved state', async () => {
    const createdRes = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerHeaders.get('Cookie')!,
      },
      body: JSON.stringify({ pageId, content: 'Resolve me' }),
    });

    const created = (await createdRes.json()) as { id: string; resolved: boolean };
    expect(created.resolved).toBe(false);

    const resolveRes = await app.request(`/api/comments/${created.id}/resolve`, {
      method: 'POST',
      headers: ownerHeaders,
    });
    expect(resolveRes.status).toBe(200);

    const resolved = (await resolveRes.json()) as { resolved: boolean };
    expect(resolved.resolved).toBe(true);
  });

  test('marks thread as read for another collaborator', async () => {
    const createdRes = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerHeaders.get('Cookie')!,
      },
      body: JSON.stringify({ pageId, content: 'Unread for member' }),
    });

    const created = (await createdRes.json()) as { id: string };

    const beforeReadList = await app.request(`/api/drafts/${draftId}/comments?pageId=${pageId}`, {
      headers: memberHeaders,
    });
    const beforeRead = (await beforeReadList.json()) as Array<{ id: string; unread: boolean }>;
    expect(beforeRead[0]!.id).toBe(created.id);
    expect(beforeRead[0]!.unread).toBe(true);

    const readRes = await app.request(`/api/comments/${created.id}/read`, {
      method: 'POST',
      headers: memberHeaders,
    });
    expect(readRes.status).toBe(200);

    const afterReadList = await app.request(`/api/drafts/${draftId}/comments?pageId=${pageId}`, {
      headers: memberHeaders,
    });
    const afterRead = (await afterReadList.json()) as Array<{ id: string; unread: boolean }>;
    expect(afterRead[0]!.id).toBe(created.id);
    expect(afterRead[0]!.unread).toBe(false);
  });

  test('prevents deleting comments authored by another user', async () => {
    const createdRes = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerHeaders.get('Cookie')!,
      },
      body: JSON.stringify({ pageId, content: 'Owner comment' }),
    });

    const created = (await createdRes.json()) as { id: string };

    const deleteRes = await app.request(`/api/comments/${created.id}`, {
      method: 'DELETE',
      headers: memberHeaders,
    });
    expect(deleteRes.status).toBe(403);
  });
});
