import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';

const userRoutes = new Hono<AuthEnv>();

userRoutes.get('/me', requireAuth, (c) => {
  const { id, email, name, image, role } = c.get('user');
  return c.json({ user: { id, email, name, image, role } });
});

export { userRoutes };
