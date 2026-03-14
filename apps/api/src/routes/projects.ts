import { Hono } from 'hono';
import { db } from '../db';
import { project } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createProjectSchema } from '@draftila/shared';
import { nanoid } from '../lib/utils';

const projects = new Hono();

// List projects for current user
projects.get('/', async (c) => {
  const userId = c.get('userId' as never) as string;
  const results = await db.select().from(project).where(eq(project.ownerId, userId));
  return c.json(results);
});

// Create a new project
projects.post('/', async (c) => {
  const userId = c.get('userId' as never) as string;
  const body = await c.req.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const newProject = await db
    .insert(project)
    .values({
      id: nanoid(),
      name: parsed.data.name,
      ownerId: userId,
    })
    .returning();

  return c.json(newProject[0], 201);
});

// Get a single project
projects.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(project).where(eq(project.id, id));

  if (result.length === 0) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(result[0]);
});

// Delete a project
projects.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(project).where(eq(project.id, id));
  return c.json({ ok: true });
});

export { projects };
