import { Hono } from 'hono';
import {
  createDraftSchema,
  importDraftSchema,
  sortablePaginationSchema,
  updateDraftSchema,
} from '@draftila/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import { canDelete, canEdit, getEffectiveMembership } from '../projects/members.service';
import * as draftsService from './drafts.service';

type DraftEnv = AuthEnv & { Variables: AuthEnv['Variables'] };

const draftRoutes = new Hono<DraftEnv>();

draftRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership) {
    throw new NotFoundError('Project');
  }

  const parsed = sortablePaginationSchema.safeParse({
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
    sort: c.req.query('sort'),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const result = await draftsService.listByProject(
    projectId,
    parsed.data.cursor,
    parsed.data.limit,
    parsed.data.sort,
  );
  return c.json(result);
});

draftRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership || !canEdit(membership.role)) {
    throw new ForbiddenError();
  }

  const body = await c.req.json();
  const parsed = createDraftSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const draftRecord = await draftsService.create({
    name: parsed.data.name,
    projectId,
  });

  return c.json(draftRecord, 201);
});

draftRoutes.get('/export-all', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership) {
    throw new NotFoundError('Project');
  }

  const exports = await draftsService.exportAllDrafts(projectId);

  if (exports.length === 0) {
    return c.json({ exports: [] });
  }

  if (exports.length === 1) {
    return c.json(exports[0]!);
  }

  const zip = await draftsService.buildExportZip(exports);
  return new Response(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="drafts.draftila.zip"',
    },
  });
});

draftRoutes.post('/import', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership || !canEdit(membership.role)) {
    throw new ForbiddenError();
  }

  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw new ValidationError({ file: ['A .draftila.json file is required'] });
  }

  if (file.size > 50 * 1024 * 1024) {
    throw new ValidationError({ file: ['File must be under 50MB'] });
  }

  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ValidationError({ file: ['Invalid JSON file'] });
  }

  const parsed = importDraftSchema.safeParse(json);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError({
      file: [
        'Invalid draft file format',
        ...Object.entries(flattened.fieldErrors).map(
          ([key, errors]) => `${key}: ${(errors as string[]).join(', ')}`,
        ),
      ],
    });
  }

  const draft = await draftsService.importDraft(parsed.data.draft, projectId);
  return c.json(draft, 201);
});

draftRoutes.get('/:draftId/export', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const draftId = c.req.param('draftId');

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership) {
    throw new NotFoundError('Project');
  }

  const existing = await draftsService.getById(draftId);
  if (!existing || existing.projectId !== projectId) {
    throw new NotFoundError('Draft');
  }

  const exported = await draftsService.exportDraft(draftId);
  if (!exported) {
    throw new NotFoundError('Draft');
  }

  return c.json(exported);
});

draftRoutes.get('/:draftId', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const draftId = c.req.param('draftId');

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership) {
    throw new NotFoundError('Project');
  }

  const draftRecord = await draftsService.getById(draftId);
  if (!draftRecord || draftRecord.projectId !== projectId) {
    throw new NotFoundError('Draft');
  }

  return c.json(draftRecord);
});

draftRoutes.patch('/:draftId', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const draftId = c.req.param('draftId');

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership || !canEdit(membership.role)) {
    throw new ForbiddenError();
  }

  const existing = await draftsService.getById(draftId);
  if (!existing || existing.projectId !== projectId) {
    throw new NotFoundError('Draft');
  }

  const body = await c.req.json();
  const parsed = updateDraftSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const updated = await draftsService.update(existing.id, { name: parsed.data.name });
  return c.json(updated);
});

draftRoutes.delete('/:draftId', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId') as string;
  const draftId = c.req.param('draftId');

  const membership = await getEffectiveMembership(projectId, user.id);
  if (!membership || !canDelete(membership.role)) {
    throw new ForbiddenError();
  }

  const existing = await draftsService.getById(draftId);
  if (!existing || existing.projectId !== projectId) {
    throw new NotFoundError('Draft');
  }

  await draftsService.remove(existing.id);
  return c.json({ ok: true });
});

const allDraftsRoutes = new Hono<DraftEnv>();

allDraftsRoutes.get('/:draftId', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId');

  const draftRecord = await draftsService.getByIdForUser(draftId, user.id);
  if (!draftRecord) {
    throw new NotFoundError('Draft');
  }

  return c.json(draftRecord);
});

allDraftsRoutes.put('/:draftId/thumbnail', requireAuth, async (c) => {
  const user = c.get('user');
  const draftId = c.req.param('draftId');

  const draftRecord = await draftsService.getByIdForUser(draftId, user.id);
  if (!draftRecord) {
    throw new NotFoundError('Draft');
  }

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new ValidationError({ thumbnail: ['Body must be an image'] });
  }

  const arrayBuffer = await c.req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new ValidationError({ thumbnail: ['Body must not be empty'] });
  }
  if (arrayBuffer.byteLength > 512 * 1024) {
    throw new ValidationError({ thumbnail: ['Thumbnail must be under 512KB'] });
  }

  const url = await draftsService.saveThumbnail(draftId, Buffer.from(arrayBuffer));
  return c.json({ url });
});

allDraftsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');

  const parsed = sortablePaginationSchema.safeParse({
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
    sort: c.req.query('sort'),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const result = await draftsService.listByUser(
    user.id,
    parsed.data.cursor,
    parsed.data.limit,
    parsed.data.sort,
  );
  return c.json(result);
});

export { draftRoutes, allDraftsRoutes };
