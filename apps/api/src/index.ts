import { app } from './app';
import { env } from './common/lib/env';

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`API server running at http://localhost:${env.PORT}`);
