import { Hono } from 'hono';
import { auth } from './auth.service';

const authRoutes = new Hono();

// All better-auth endpoints (sign-in, sign-up, sign-out, session, etc.)
authRoutes.on(['POST', 'GET'], '/**', (c) => {
  return auth.handler(c.req.raw);
});

export { authRoutes };
