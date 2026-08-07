import { Hono } from 'hono';
import { env } from '../../common/lib/env';

const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    instanceId: env.RUNTIME_INSTANCE_ID,
  });
});

export { healthRoutes };
