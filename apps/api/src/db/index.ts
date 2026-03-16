import { resolve } from 'node:path';
import { env } from '../common/lib/env';
import { PrismaClient as PostgresqlPrismaClient } from '../generated/prisma/postgresql-client';
import { PrismaClient as SqlitePrismaClient } from '../generated/prisma/sqlite-client';

type AppPrismaClient = PostgresqlPrismaClient;

function createClient(): AppPrismaClient {
  if (env.DB_DRIVER === 'sqlite') {
    const sqliteUrl = normalizeSqliteUrl(env.DATABASE_URL);
    return new SqlitePrismaClient({
      datasources: {
        db: {
          url: sqliteUrl,
        },
      },
    }) as unknown as AppPrismaClient;
  }
  return new PostgresqlPrismaClient();
}

function normalizeSqliteUrl(url: string) {
  if (!url.startsWith('file:')) {
    return url;
  }
  const filePath = url.slice('file:'.length);
  if (!filePath.startsWith('./') && !filePath.startsWith('../')) {
    return url;
  }
  if (filePath.startsWith('./prisma/') || filePath.startsWith('prisma/')) {
    return `file:${resolve(process.cwd(), filePath.replace(/^\.\//, ''))}`;
  }
  return `file:${resolve(process.cwd(), 'prisma/sqlite', filePath)}`;
}

const globalForDb = globalThis as { db?: AppPrismaClient };

export const db = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}
