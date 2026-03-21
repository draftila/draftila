import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { AppError, ValidationError } from './common/errors';
import { env } from './common/lib/env';
import type { AuthEnv } from './common/middleware/auth';
import { checkRateLimit } from './common/middleware/rate-limit';
import { authRoutes } from './modules/auth/auth.routes';
import { allDraftsRoutes, draftRoutes } from './modules/drafts/drafts.routes';
import { healthRoutes } from './modules/health/health.routes';
import { projectRoutes } from './modules/projects/projects.routes';
import { userRoutes } from './modules/user/user.routes';

const app = new Hono<AuthEnv>();
const webDistDir = resolve(process.cwd(), process.env.WEB_DIST_DIR ?? '../web/dist');
const webDistPrefix = `${webDistDir}/`;
const webIndexPath = join(webDistDir, 'index.html');

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveWebAssetPath(pathname: string): string | null {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;
  if (cleanPath.includes('..') || cleanPath.includes('\0')) return null;
  const resolved = resolve(webDistDir, cleanPath);
  if (resolved !== webDistDir && !resolved.startsWith(webDistPrefix)) return null;
  return resolved;
}

app.use(logger());
app.use(secureHeaders());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth') || c.req.path.startsWith('/api/health')) {
    return next();
  }
  const blocked = checkRateLimit(c, 'api-general', { windowMs: 60_000, max: 120 });
  if (blocked) return blocked;
  return next();
});

app.route('/api/auth', authRoutes);
app.route('/api/health', healthRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/drafts', allDraftsRoutes);
app.route('/api/projects/:projectId/drafts', draftRoutes);
app.route('/api', userRoutes);

if (isFile(webIndexPath)) {
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.notFound();
    }

    const assetPath = resolveWebAssetPath(c.req.path);
    if (assetPath && isFile(assetPath)) {
      return new Response(Bun.file(assetPath));
    }

    if (extname(c.req.path)) {
      return c.notFound();
    }

    return new Response(Bun.file(webIndexPath));
  });
}

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
  console.error('Unhandled error:', err.message);
  return c.json({ error: 'Internal server error' }, 500);
});

export { app };
