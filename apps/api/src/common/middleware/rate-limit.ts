import type { Context } from 'hono';
import { env } from '../lib/env';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

export function resetRateLimitStore(name: string) {
  stores.get(name)?.clear();
}

export function getClientIp(c: Context): string {
  const remoteIp = c.req.header('x-remote-ip');
  const trustedProxies = env.TRUSTED_PROXY_IPS;

  if (trustedProxies && remoteIp) {
    const isTrusted = trustedProxies === '*' || trustedProxies.has(remoteIp);

    if (isTrusted) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;

      const realIp = c.req.header('x-real-ip');
      if (realIp) return realIp;
    }
  }

  return remoteIp ?? 'unknown';
}

export function checkRateLimit(
  c: Context,
  name: string,
  options: RateLimitOptions,
): Response | null {
  const store = getStore(name);
  const ip = getClientIp(c);
  const now = Date.now();
  const entry = store.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= options.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests' }, 429);
    }
    entry.count++;
  } else {
    store.set(ip, { count: 1, resetAt: now + options.windowMs });
  }

  return null;
}
