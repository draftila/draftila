import { Hono } from 'hono';
import {
  createProjectSchema,
  sortablePaginationSchema,
  updateProjectSchema,
} from '@draftila/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import { canEdit } from './members.service';
import * as membersService from './members.service';
import * as projectsService from './projects.service';

const projectRoutes = new Hono<AuthEnv>();

projectRoutes.get('/', requireAuth, async (c) => {
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

  const result = await projectsService.listByOwner(
    user.id,
    parsed.data.cursor,
    parsed.data.limit,
    parsed.data.sort,
  );
  return c.json(result);
});

projectRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const project = await projectsService.create({
    name: parsed.data.name,
    ownerId: user.id,
  });

  return c.json(project, 201);
});

projectRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const project = await projectsService.getByIdForUser(c.req.param('id'), user.id);

  if (!project) {
    throw new NotFoundError('Project');
  }

  return c.json(project);
});

projectRoutes.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  const membership = await membersService.getEffectiveMembership(projectId, user.id);
  if (!membership || !canEdit(membership.role)) {
    throw new ForbiddenError();
  }

  const body = await c.req.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const updated = await projectsService.update(projectId, parsed.data);
  if (!updated) {
    throw new NotFoundError('Project');
  }

  return c.json(updated);
});

projectRoutes.put('/:id/logo', requireAuth, async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  const membership = await membersService.getEffectiveMembership(projectId, user.id);
  if (!membership || !canEdit(membership.role)) {
    throw new ForbiddenError();
  }

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new ValidationError({ logo: ['Body must be an image'] });
  }

  const arrayBuffer = await c.req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new ValidationError({ logo: ['Body must not be empty'] });
  }
  if (arrayBuffer.byteLength > 512 * 1024) {
    throw new ValidationError({ logo: ['Logo must be under 512KB'] });
  }

  const url = await projectsService.saveLogo(projectId, Buffer.from(arrayBuffer));
  return c.json({ url });
});

projectRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const deleted = await projectsService.remove(c.req.param('id'), user.id);

  if (!deleted) {
    throw new NotFoundError('Project');
  }

  return c.json({ ok: true });
});

export { projectRoutes };
