import type { Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import { auth } from '../../modules/auth/auth.service';

type AuthSession = typeof auth.$Infer.Session;

export type AuthEnv = Env & {
  Variables: {
    user: AuthSession['user'];
    session: AuthSession['session'];
  };
};

/**
 * Middleware that validates the session and attaches user/session to the context.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', session.user);
  c.set('session', session.session);

  await next();
});
