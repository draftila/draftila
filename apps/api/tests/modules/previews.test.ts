import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { app } from '../../src/app';
import { db } from '../../src/db';
import {
  extractStorageKey,
  getStorage,
  getStoragePath,
  initStorage,
} from '../../src/common/lib/storage';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as projectsService from '../../src/modules/projects/projects.service';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

function imageData(color: string) {
  const canvas = createCanvas(2, 2);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 2, 2);
  return Buffer.from(canvas.toBuffer('image/jpeg'));
}

describe('preview persistence', () => {
  let storageDirectory = '';
  let previousStoragePath = '';
  let authHeaders: Headers;
  let projectId: string;
  let draftId: string;

  beforeEach(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');
    resetRateLimitStore('api-general');
    previousStoragePath = getStoragePath();
    storageDirectory = await mkdtemp(join(tmpdir(), 'draftila-previews-'));
    initStorage({ driver: 'local', path: storageDirectory });
    const { user } = await createTestUser();
    authHeaders = await getAuthHeaders(user.email, 'password123');
    const project = await projectsService.create({ name: 'Preview Project', ownerId: user.id });
    projectId = project.id;
    const draft = await draftsService.create({ name: 'Preview Draft', projectId });
    draftId = draft.id;
  });

  afterEach(async () => {
    initStorage({ driver: 'local', path: previousStoragePath });
    await rm(storageDirectory, { recursive: true, force: true });
  });

  async function upload(path: string, data: Buffer): Promise<string> {
    const headers = new Headers(authHeaders);
    headers.set('Content-Type', 'image/jpeg');
    const response = await app.request(path, {
      method: 'PUT',
      headers,
      body: new Uint8Array(data).buffer,
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { url: string };
    return result.url;
  }

  test.each(['thumbnail', 'logo'])(
    'serves current %s content through cached URLs after replacement and restart',
    async (kind) => {
      const path =
        kind === 'thumbnail'
          ? `/api/drafts/${draftId}/thumbnail`
          : `/api/projects/${projectId}/logo`;
      const firstUrl = await upload(path, imageData('red'));
      const replacement = imageData('blue');
      const secondUrl = await upload(path, replacement);

      expect(secondUrl).not.toBe(firstUrl);
      expect(extractStorageKey(secondUrl)).toBe(extractStorageKey(firstUrl));
      initStorage({ driver: 'local', path: storageDirectory });

      for (const url of [firstUrl.split('?')[0]!, firstUrl, secondUrl]) {
        const response = await app.request(url);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('public, no-cache');
        expect(response.headers.get('Content-Type')).toBe('image/jpeg');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(replacement);
      }

      if (kind === 'thumbnail') {
        expect((await draftsService.getById(draftId))?.thumbnail).toBe(secondUrl);
        await draftsService.remove(draftId);
      } else {
        const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
        expect(project.logo).toBe(secondUrl);
        await projectsService.remove(projectId, project.ownerId);
      }

      expect((await app.request(secondUrl)).status).toBe(404);
    },
  );

  test('restores a missing legacy thumbnail without breaking its saved URL', async () => {
    const legacyUrl = '/storage/thumbnails/missing.jpg';
    await db.draft.update({ where: { id: draftId }, data: { thumbnail: legacyUrl } });
    expect((await app.request(legacyUrl)).status).toBe(404);

    const data = imageData('green');
    await upload(`/api/drafts/${draftId}/thumbnail`, data);

    const response = await app.request(legacyUrl);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(data);
  });

  test('keeps immutable caching for draft assets', async () => {
    const url = await getStorage().put(`draft-assets/${draftId}/image.jpg`, imageData('red'));
    const response = await app.request(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test('deleting a project removes versioned draft thumbnails too', async () => {
    const url = await upload(`/api/drafts/${draftId}/thumbnail`, imageData('red'));
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });

    await projectsService.remove(project.id, project.ownerId);

    expect((await app.request(url)).status).toBe(404);
  });
});
