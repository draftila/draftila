import { Hono } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import * as apiKeysService from './api-keys.service';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

const apiKeyRoutes = new Hono<AuthEnv>();

apiKeyRoutes.use(requireAuth);

apiKeyRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createApiKeySchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const result = await apiKeysService.create(user.id, parsed.data.name);
  return c.json(result, 201);
});

apiKeyRoutes.get('/', async (c) => {
  const user = c.get('user');
  const keys = await apiKeysService.listByUser(user.id);
  return c.json({ data: keys });
});

apiKeyRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const deleted = await apiKeysService.remove(id, user.id);
  if (!deleted) return c.json({ error: 'API key not found' }, 404);
  return c.json({ ok: true });
});

export { apiKeyRoutes };
