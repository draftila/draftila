import { Hono } from 'hono';
import { checkRateLimit } from '../../common/middleware/rate-limit';
import { auth } from './auth.service';

const authRoutes = new Hono();

authRoutes.on(['POST', 'GET'], '/*', (c) => {
  if (c.req.method === 'POST') {
    const path = new URL(c.req.url).pathname;

    if (path.includes('/sign-in')) {
      const blocked = checkRateLimit(c, 'sign-in', { windowMs: 60_000, max: 5 });
      if (blocked) return blocked;
    } else if (path.includes('/sign-up')) {
      const blocked = checkRateLimit(c, 'sign-up', { windowMs: 60_000, max: 3 });
      if (blocked) return blocked;
    } else {
      const blocked = checkRateLimit(c, 'auth-general', { windowMs: 60_000, max: 10 });
      if (blocked) return blocked;
    }
  }

  return auth.handler(c.req.raw);
});

export { authRoutes };
