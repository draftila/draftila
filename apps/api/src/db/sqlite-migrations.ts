import { Database } from 'bun:sqlite';
import { isAbsolute, resolve } from 'node:path';
import initialMigration from '../../prisma/sqlite/migrations/0001_initial.sql' with { type: 'text' };
import draftUpdateMigration from '../../prisma/sqlite/migrations/0002_draft_update.sql' with { type: 'text' };

interface Migration {
  id: string;
  sql: string;
}

const migrations: Migration[] = [
  { id: '0001_initial', sql: initialMigration },
  { id: '0002_draft_update', sql: draftUpdateMigration },
];

function resolveDatabasePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('The native Draftila runtime requires a SQLite file database');
  }
  const value = databaseUrl.slice('file:'.length);
  if (!value) throw new Error('DATABASE_URL must include a SQLite database path');
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function migrateSqliteDatabase(databaseUrl: string): void {
  const database = new Database(resolveDatabasePath(databaseUrl), { create: true });
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec(
      'CREATE TABLE IF NOT EXISTS "_draftila_migration" ("id" TEXT NOT NULL PRIMARY KEY, "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const hasMigration = database.query<{ id: string }, [string]>(
      'SELECT "id" FROM "_draftila_migration" WHERE "id" = ?',
    );
    const recordMigration = database.query('INSERT INTO "_draftila_migration" ("id") VALUES (?)');
    for (const migration of migrations) {
      if (hasMigration.get(migration.id)) continue;
      database.transaction(() => {
        database.exec(migration.sql);
        recordMigration.run(migration.id);
      })();
    }
  } finally {
    database.close();
  }
}
