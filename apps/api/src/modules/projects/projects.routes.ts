import { Hono } from 'hono';
import { createProjectSchema } from '@draftila/shared';
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
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const project = await projectsService.create({
    name: parsed.data.name,
    ownerId: user.id,
  });

  return c.json(project, 201);
});

projectRoutes.get('/:id', async (c) => {
  const project = await projectsService.getById(c.req.param('id'));

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(project);
});

projectRoutes.delete('/:id', async (c) => {
  await projectsService.remove(c.req.param('id'));
  return c.json({ ok: true });
});

export { projectRoutes };
