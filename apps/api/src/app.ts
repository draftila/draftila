import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError, ValidationError } from './common/errors';
import { env } from './common/lib/env';
import type { AuthEnv } from './common/middleware/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { draftRoutes } from './modules/drafts/drafts.routes';
import { healthRoutes } from './modules/health/health.routes';
import { projectRoutes } from './modules/projects/projects.routes';
import { userRoutes } from './modules/user/user.routes';

const app = new Hono<AuthEnv>();

app.use(logger());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.route('/api/auth', authRoutes);
app.route('/api/health', healthRoutes);
app.route('/api', userRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/projects/:projectId/drafts', draftRoutes);

app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ error: err.message, fieldErrors: err.fieldErrors }, 400);
  }
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode as ContentfulStatusCode);
  }
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export { app };
