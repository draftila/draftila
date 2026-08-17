import { Hono } from 'hono';
import { env } from '../../common/lib/env';
import { metricsEnabled, metricsSnapshot, resetMetrics } from '../../common/lib/metrics';
import { requireAdmin } from '../../common/middleware/admin';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import { getRoomCount } from '../collaboration/collaboration.service';

const healthRoutes = new Hono<AuthEnv>();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    instanceId: env.RUNTIME_INSTANCE_ID,
  });
});

healthRoutes.get('/metrics', requireAuth, requireAdmin, (c) => {
  if (!metricsEnabled()) {
    return c.json({ error: 'Metrics are disabled. Set METRICS_ENABLED=true.' }, 404);
  }
  return c.json({
    timestamp: new Date().toISOString(),
    driver: env.DB_DRIVER,
    activeRooms: getRoomCount(),
    ...metricsSnapshot(),
  });
});

healthRoutes.post('/metrics/reset', requireAuth, requireAdmin, (c) => {
  if (!metricsEnabled()) {
    return c.json({ error: 'Metrics are disabled. Set METRICS_ENABLED=true.' }, 404);
  }
  resetMetrics();
  return c.json({ status: 'reset' });
});

export { healthRoutes };
