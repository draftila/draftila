import { createSnapshotSchema, updateSnapshotSchema } from '@draftila/shared';
import { Hono } from 'hono';
import { NotFoundError } from '../../common/errors';
import { validateOrThrow } from '../../common/lib/validation';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as draftsService from '../drafts/drafts.service';
import * as snapshotsService from './snapshots.service';

const draftSnapshotRoutes = new Hono<AuthEnv>();
const snapshotRoutes = new Hono<AuthEnv>();

async function ensureSnapshotAccess(snapshotId: string, userId: string) {
  const draftId = await snapshotsService.getDraftIdForSnapshot(snapshotId);
  if (!draftId) {
    throw new NotFoundError('Snapshot');
  }
  await draftsService.ensureDraftAccess(draftId, userId);
  return draftId;
}

draftSnapshotRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  await draftsService.ensureDraftAccess(draftId, user.id);

  const autoSaves = c.req.query('autoSaves') !== 'false';
  const snapshots = await snapshotsService.listByDraft(draftId, autoSaves);
  return c.json(snapshots);
});

draftSnapshotRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId') as string;

  await draftsService.ensureDraftAccess(draftId, user.id);

  const body = await c.req.json();
  const parsed = validateOrThrow(createSnapshotSchema, body);

  const snapshot = await snapshotsService.createNamedVersion(draftId, user.id, parsed.name);
  return c.json(snapshot, 201);
});

snapshotRoutes.get('/:snapshotId/state', requireAuth, async (c) => {
  const user = c.get('user');
  const snapshotId = c.req.param('snapshotId');

  await ensureSnapshotAccess(snapshotId, user.id);

  const state = await snapshotsService.getState(snapshotId);
  return new Response(new Uint8Array(state), {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
});

snapshotRoutes.patch('/:snapshotId', requireAuth, async (c) => {
  const user = c.get('user');
  const snapshotId = c.req.param('snapshotId');

  await ensureSnapshotAccess(snapshotId, user.id);

  const body = await c.req.json();
  const parsed = validateOrThrow(updateSnapshotSchema, body);

  const updated = await snapshotsService.updateName(snapshotId, parsed.name);
  return c.json(updated);
});

snapshotRoutes.post('/:snapshotId/restore', requireAuth, async (c) => {
  const user = c.get('user');
  const snapshotId = c.req.param('snapshotId');

  const draftId = await ensureSnapshotAccess(snapshotId, user.id);

  const restored = await snapshotsService.restoreSnapshot(draftId, snapshotId, user.id);
  return c.json(restored);
});

export { draftSnapshotRoutes, snapshotRoutes };
