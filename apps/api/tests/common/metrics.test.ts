import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { app } from '../../src/app';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import { cleanDatabase, createTestUser, getAuthHeaders, makeAdmin } from '../helpers';
import {
  increment,
  metricsSnapshot,
  recordDuration,
  recordValue,
  resetMetrics,
  setMetricsEnabled,
  timed,
} from '../../src/common/lib/metrics';

interface DurationSummary {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

afterEach(() => {
  setMetricsEnabled(false);
  resetMetrics();
});

describe('metrics endpoint', () => {
  let adminHeaders: Headers;
  let memberHeaders: Headers;

  beforeAll(async () => {
    await cleanDatabase();
    resetRateLimitStore('sign-in');
    resetRateLimitStore('sign-up');

    const admin = await createTestUser({
      email: 'metrics-admin@draftila.test',
      password: 'password123',
      name: 'Metrics Admin',
    });
    await makeAdmin(admin.user.id);
    adminHeaders = await getAuthHeaders('metrics-admin@draftila.test', 'password123');

    await createTestUser({
      email: 'metrics-member@draftila.test',
      password: 'password123',
      name: 'Metrics Member',
    });
    memberHeaders = await getAuthHeaders('metrics-member@draftila.test', 'password123');
  });

  test('rejects anonymous callers', async () => {
    setMetricsEnabled(true);

    expect((await app.request('/api/health/metrics')).status).toBe(401);
    expect((await app.request('/api/health/metrics/reset', { method: 'POST' })).status).toBe(401);
  });

  test('rejects authenticated non-admin callers', async () => {
    setMetricsEnabled(true);

    expect((await app.request('/api/health/metrics', { headers: memberHeaders })).status).toBe(403);
    expect(
      (
        await app.request('/api/health/metrics/reset', {
          method: 'POST',
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
  });

  test('is disabled unless metrics are enabled', async () => {
    const res = await app.request('/api/health/metrics', { headers: adminHeaders });
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('METRICS_ENABLED');
  });

  test('exposes the snapshot once enabled', async () => {
    setMetricsEnabled(true);
    resetMetrics();
    recordDuration('http.all', 12);

    const res = await app.request('/api/health/metrics', { headers: adminHeaders });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      enabled: boolean;
      driver: string;
      activeRooms: number;
      durations: Record<string, DurationSummary>;
    };
    expect(body.enabled).toBe(true);
    expect(body.driver).toBeDefined();
    expect(body.activeRooms).toBe(0);
    expect(body.durations['http.all']?.count).toBe(1);
  });

  test('reset clears recorded metrics', async () => {
    setMetricsEnabled(true);
    recordDuration('http.all', 12);

    const res = await app.request('/api/health/metrics/reset', {
      method: 'POST',
      headers: adminHeaders,
    });
    expect(res.status).toBe(200);
    expect(metricsSnapshot().durations['http.all']).toBeUndefined();
  });

  test('the liveness probe stays public', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('metrics recorder', () => {
  test('records nothing while disabled', () => {
    recordDuration('bench.op', 10);
    recordValue('bench.bytes', 10);
    increment('bench.saves');

    const snapshot = metricsSnapshot();
    expect(snapshot.durations['bench.op']).toBeUndefined();
    expect(snapshot.values['bench.bytes']).toBeUndefined();
    expect(snapshot.counters['bench.saves']).toBeUndefined();
  });

  test('aggregates durations into percentiles', () => {
    setMetricsEnabled(true);
    for (let i = 1; i <= 100; i++) {
      recordDuration('bench.op', i);
    }

    const summary = metricsSnapshot().durations['bench.op'] as DurationSummary;
    expect(summary.count).toBe(100);
    expect(summary.meanMs).toBeCloseTo(50.5, 1);
    expect(summary.maxMs).toBe(100);
    expect(summary.p50Ms).toBeGreaterThanOrEqual(50);
    expect(summary.p95Ms).toBeGreaterThanOrEqual(summary.p50Ms);
  });

  test('tracks values and counters', () => {
    setMetricsEnabled(true);
    recordValue('bench.bytes', 100);
    recordValue('bench.bytes', 300);
    increment('bench.saves');
    increment('bench.saves', 4);

    const snapshot = metricsSnapshot();
    const value = snapshot.values['bench.bytes'] as { mean: number; min: number; max: number };

    expect(value.min).toBe(100);
    expect(value.max).toBe(300);
    expect(value.mean).toBe(200);
    expect(snapshot.counters['bench.saves']).toBe(5);
  });

  test('timed records the duration of an async call', async () => {
    setMetricsEnabled(true);
    const result = await timed('bench.async', async () => {
      await Bun.sleep(5);
      return 'done';
    });

    expect(result).toBe('done');
    const summary = metricsSnapshot().durations['bench.async'] as DurationSummary;
    expect(summary.count).toBe(1);
    expect(summary.maxMs).toBeGreaterThanOrEqual(4);
  });
});
