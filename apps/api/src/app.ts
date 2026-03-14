import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError, ValidationError } from './common/errors';
import type { AuthEnv } from './common/middleware/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { projectRoutes } from './modules/projects/projects.routes';
import { userRoutes } from './modules/user/user.routes';

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
app.route('/api', userRoutes);
app.route('/api/projects', projectRoutes);

app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ error: err.message, fieldErrors: err.fieldErrors }, 400);
  }
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode as ContentfulStatusCode);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export { app };
