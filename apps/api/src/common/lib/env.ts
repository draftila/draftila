/// <reference types="@types/bun" />

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  BETTER_AUTH_SECRET: requireEnv('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: requireEnv('BETTER_AUTH_URL'),
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
} as const;
