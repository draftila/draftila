import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';

const userRoutes = new Hono<AuthEnv>();

userRoutes.use(requireAuth);

userRoutes.get('/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

export { userRoutes };
