/// <reference types="@types/bun" />

function requireEnv(name: string, minLength?: number): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (minLength && value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  return value;
}

function parseDbDriver(value: string | undefined): 'postgresql' | 'sqlite' {
  if (!value) {
    return 'postgresql';
  }
  if (value === 'postgresql' || value === 'sqlite') {
    return value;
  }
  throw new Error('DB_DRIVER must be either "postgresql" or "sqlite"');
}

function parseStorageDriver(value: string | undefined): 'local' {
  if (!value || value === 'local') return 'local';
  throw new Error('STORAGE_DRIVER must be "local"');
}

function parseHost(value: string | undefined): '127.0.0.1' | '0.0.0.0' {
  if (!value || value === '0.0.0.0') return '0.0.0.0';
  if (value === '127.0.0.1') return value;
  throw new Error('HOST must be either "127.0.0.1" or "0.0.0.0"');
}

function parseTrustedProxies(value: string | undefined): Set<string> | '*' | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '*') return '*';
  const ips = trimmed
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  return ips.length > 0 ? new Set(ips) : null;
}

function parseFrontendUrls(value: string | undefined, fallback: string): string[] {
  const urls = (value ?? fallback)
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (urls.length === 0) throw new Error('At least one frontend URL is required');
  for (const url of urls) {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== url) {
      throw new Error(`Invalid frontend URL: ${url}`);
    }
  }
  return [...new Set(urls)];
}

const frontendUrls = parseFrontendUrls(
  process.env.FRONTEND_URLS,
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
);

export const env = {
  DB_DRIVER: parseDbDriver(process.env.DB_DRIVER),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  BETTER_AUTH_SECRET: requireEnv('BETTER_AUTH_SECRET', 32),
  BETTER_AUTH_URL: requireEnv('BETTER_AUTH_URL'),
  HOST: parseHost(process.env.HOST),
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  FRONTEND_URL: frontendUrls[0]!,
  FRONTEND_URLS: frontendUrls,
  STORAGE_DRIVER: parseStorageDriver(process.env.STORAGE_DRIVER),
  STORAGE_PATH: process.env.STORAGE_PATH ?? './storage',
  TRUSTED_PROXY_IPS: parseTrustedProxies(process.env.TRUSTED_PROXY_IPS),
  RUNTIME_INSTANCE_ID: process.env.DRAFTILA_RUNTIME_INSTANCE_ID ?? null,
  METRICS_ENABLED: process.env.METRICS_ENABLED === 'true',
  SLOW_QUERY_MS: parseInt(process.env.SLOW_QUERY_MS ?? '50', 10),
  SLOW_REQUEST_MS: parseInt(process.env.SLOW_REQUEST_MS ?? '250', 10),
} as const;
