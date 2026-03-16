import { rm } from 'node:fs/promises';

const dbDriver = process.env.DB_DRIVER ?? 'sqlite';
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  (dbDriver === 'sqlite'
    ? 'file:./test.sqlite'
    : 'postgresql://postgres:postgres@localhost:5432/draftila_test');

process.env.DB_DRIVER = dbDriver;
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'test-secret-at-least-32-characters-long-for-tests';
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function getSchemaPath(driver: 'sqlite' | 'postgresql') {
  if (driver === 'sqlite') {
    return 'prisma/sqlite/schema.prisma';
  }
  return 'prisma/postgresql/schema.prisma';
}

if (dbDriver !== 'sqlite' && dbDriver !== 'postgresql') {
  throw new Error('DB_DRIVER must be either "postgresql" or "sqlite" for tests');
}

if (dbDriver === 'sqlite' && process.env.DATABASE_URL?.startsWith('file:')) {
  const sqlitePath = process.env.DATABASE_URL.slice('file:'.length);
  await rm(sqlitePath, { force: true });
}

await Bun.$`bunx --bun prisma db push --accept-data-loss --schema ${getSchemaPath(dbDriver)}`;
