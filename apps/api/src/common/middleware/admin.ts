import { createMiddleware } from 'hono/factory';
import { ForbiddenError } from '../errors';
import type { AuthEnv } from './auth';

/** Must be chained after `requireAuth`, which is what populates the `user` variable. */
export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user');

  if (user?.role !== 'admin') {
    throw new ForbiddenError();
  }

  await next();
});
