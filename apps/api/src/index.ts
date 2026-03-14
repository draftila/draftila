import { app } from './app';

const port = parseInt(process.env.PORT ?? '3001', 10);

Bun.serve({
  port,
  fetch: app.fetch,
  websocket: {
    message() {},
    open() {},
    close() {},
  },
});

console.log(`API server running at http://localhost:${port}`);
