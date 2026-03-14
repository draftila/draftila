import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth';
import { projects } from './routes/projects';
import { handleWSUpgrade } from './ws';

const app = new Hono();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(logger());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

// ── Auth routes (handled by better-auth) ────────────────────────────────────

app.on(['POST', 'GET'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw);
});

// ── Health check ────────────────────────────────────────────────────────────

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ──────────────────────────────────────────────────────────────

app.route('/api/projects', projects);

// ── Server ──────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3001', 10);

const server = Bun.serve({
  port,
  fetch: app.fetch,
  websocket: {
    message(ws, message) {
      // Handled inside handleWSUpgrade
    },
    open(ws) {},
    close(ws) {},
  },
});

console.log(`🚀 API server running at http://localhost:${port}`);

export default app;
