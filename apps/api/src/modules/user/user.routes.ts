import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';

const userRoutes = new Hono<AuthEnv>();

userRoutes.use(requireAuth);

userRoutes.get('/me', (c) => {
  const { id, email, name, image } = c.get('user');
  return c.json({ user: { id, email, name, image } });
});

export { userRoutes };
