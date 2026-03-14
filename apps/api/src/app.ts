import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requireAuth, type AuthEnv } from './common/middleware/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { projectRoutes } from './modules/projects/projects.routes';

const app = new Hono<AuthEnv>();

app.use(logger());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

app.route('/api/auth', authRoutes);
app.route('/api/health', healthRoutes);

app.get('/api/me', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({ user });
});

app.route('/api/projects', projectRoutes);

export { app };
