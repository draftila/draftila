import { Hono } from 'hono';
import { createProjectSchema, sortablePaginationSchema } from '@draftila/shared';
import { NotFoundError, ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as projectsService from './projects.service';

const projectRoutes = new Hono<AuthEnv>();

projectRoutes.use(requireAuth);

projectRoutes.get('/', async (c) => {
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

projectRoutes.post('/', async (c) => {
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

projectRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const project = await projectsService.getByIdAndOwner(c.req.param('id'), user.id);

  if (!project) {
    throw new NotFoundError('Project');
  }

  return c.json(project);
});

projectRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const deleted = await projectsService.remove(c.req.param('id'), user.id);

  if (!deleted) {
    throw new NotFoundError('Project');
  }

  return c.json({ ok: true });
});

export { projectRoutes };
