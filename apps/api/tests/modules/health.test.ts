import { describe, expect, test } from 'bun:test';
import { app } from '../../src/app';

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  test('timestamp is a valid ISO string', async () => {
    const res = await app.request('/api/health');
    const body = (await res.json()) as { timestamp: string };

    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });
});
