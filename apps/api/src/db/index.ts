import { resolve } from 'node:path';
import { env } from '../common/lib/env';
import { increment, recordDuration } from '../common/lib/metrics';
import { PrismaClient as PostgresqlPrismaClient } from '../generated/prisma/postgresql-client';
import { PrismaClient as SqlitePrismaClient } from '../generated/prisma/sqlite-client';

type AppPrismaClient = PostgresqlPrismaClient;

interface QueryEvent {
  query: string;
  params: string;
  duration: number;
}

const QUERY_LOG_OPTION = [{ emit: 'event', level: 'query' }] as const;

function createClient(): AppPrismaClient {
  if (env.DB_DRIVER === 'sqlite') {
    const sqliteUrl = normalizeSqliteUrl(env.DATABASE_URL);
    return new SqlitePrismaClient({
      datasources: {
        db: {
          url: sqliteUrl,
        },
      },
      ...(env.METRICS_ENABLED ? { log: [...QUERY_LOG_OPTION] } : {}),
    }) as unknown as AppPrismaClient;
  }
  return new PostgresqlPrismaClient(
    env.METRICS_ENABLED ? { log: [...QUERY_LOG_OPTION] } : undefined,
  );
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

function queryTarget(query: string): string {
  const match = /(?:FROM|INTO|UPDATE|TABLE)\s+["`]?(?:\w+["`]?\.["`]?)?(\w+)/i.exec(query);
  const table = match?.[1] ?? 'unknown';
  const verb = query.trim().split(/\s+/)[0]?.toUpperCase() ?? 'UNKNOWN';
  return `${verb} ${table}`;
}

function attachQueryMetrics(client: AppPrismaClient): void {
  if (!env.METRICS_ENABLED) return;

  const emitter = client as unknown as {
    $on: (event: 'query', callback: (event: QueryEvent) => void) => void;
  };

  emitter.$on('query', (event) => {
    const target = queryTarget(event.query);
    recordDuration(`db.query.${target}`, event.duration);
    recordDuration('db.query.all', event.duration);
    if (event.duration >= env.SLOW_QUERY_MS) {
      increment('db.slow_query');
      console.warn(`[slow query] ${event.duration}ms ${target} :: ${event.query.slice(0, 200)}`);
    }
  });
}

const globalForDb = globalThis as { db?: AppPrismaClient };

function initClient(): AppPrismaClient {
  const client = createClient();
  attachQueryMetrics(client);
  return client;
}

export const db = globalForDb.db ?? initClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}
