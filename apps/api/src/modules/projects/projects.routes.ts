import { Hono } from 'hono';
import {
  createProjectSchema,
  sortablePaginationSchema,
  updateProjectSchema,
} from '@draftila/shared';
import { ForbiddenError, NotFoundError } from '../../common/errors';
import { validateImageUpload, validateOrThrow } from '../../common/lib/validation';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import { canEdit } from './members.service';
import * as membersService from './members.service';
import * as projectsService from './projects.service';

const projectRoutes = new Hono<AuthEnv>();

projectRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const parsed = validateOrThrow(sortablePaginationSchema, {
    cursor: c.req.query('cursor'),
    limit: c.req.query('limit'),
    sort: c.req.query('sort'),
  });

  const result = await projectsService.listByOwner(
    user.id,
    parsed.cursor,
    parsed.limit,
    parsed.sort,
  );
  return c.json(result);
});

projectRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = validateOrThrow(createProjectSchema, body);

  const project = await projectsService.create({
    name: parsed.name,
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
  const parsed = validateOrThrow(updateProjectSchema, body);

  const updated = await projectsService.update(projectId, parsed);
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

  const imageData = await validateImageUpload(c.req, 'logo');
  const url = await projectsService.saveLogo(projectId, imageData);
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
