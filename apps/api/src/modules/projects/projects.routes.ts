import { Hono } from 'hono';
import { createProjectSchema } from '@draftila/shared';
import { NotFoundError, ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as projectsService from './projects.service';

const projectRoutes = new Hono<AuthEnv>();

projectRoutes.use(requireAuth);

projectRoutes.get('/', async (c) => {
  const user = c.get('user');
  const projects = await projectsService.listByOwner(user.id);
  return c.json(projects);
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
