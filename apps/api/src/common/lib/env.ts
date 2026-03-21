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

export const env = {
  DB_DRIVER: parseDbDriver(process.env.DB_DRIVER),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  BETTER_AUTH_SECRET: requireEnv('BETTER_AUTH_SECRET', 32),
  BETTER_AUTH_URL: requireEnv('BETTER_AUTH_URL'),
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  STORAGE_DRIVER: parseStorageDriver(process.env.STORAGE_DRIVER),
  STORAGE_PATH: process.env.STORAGE_PATH ?? './storage',
  TRUSTED_PROXY_IPS: parseTrustedProxies(process.env.TRUSTED_PROXY_IPS),
} as const;
