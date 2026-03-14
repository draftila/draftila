import type { Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import { UnauthorizedError } from '../errors';
import { auth } from '../../modules/auth/auth.service';

type AuthSession = typeof auth.$Infer.Session;

export type AuthEnv = Env & {
  Variables: {
    user: AuthSession['user'];
    session: AuthSession['session'];
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new UnauthorizedError();
  }

  c.set('user', session.user);
  c.set('session', session.session);

  await next();
});
