import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateSqliteDatabase } from '../../src/db/sqlite-migrations';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('migrateSqliteDatabase', () => {
  test('creates the native runtime schema exactly once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'draftila-sqlite-migrations-'));
    directories.push(directory);
    const databasePath = join(directory, 'draftila.sqlite');
    const databaseUrl = `file:${databasePath}`;

    migrateSqliteDatabase(databaseUrl);
    migrateSqliteDatabase(databaseUrl);

    const database = new Database(databasePath);
    try {
      const tables = database
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map(({ name }) => name);
      const migrations = database
        .query<{ id: string }, []>('SELECT id FROM _draftila_migration ORDER BY id')
        .all();

      expect(tables).toContain('user');
      expect(tables).toContain('project');
      expect(tables).toContain('draft');
      expect(tables).toContain('draft_update');
      expect(migrations).toEqual([{ id: '0001_initial' }, { id: '0002_draft_update' }]);

      const indexes = database
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'draft_update'",
        )
        .all()
        .map(({ name }) => name);
      expect(indexes).toContain('draft_update_draft_id_idx');

      const columns = database
        .query<{ name: string }, []>("SELECT name FROM pragma_table_info('draft_update')")
        .all()
        .map(({ name }) => name);
      expect(columns).toEqual(['id', 'draft_id', 'payload', 'created_at']);
    } finally {
      database.close();
    }
  });

  test('rejects non-file database URLs', () => {
    expect(() => migrateSqliteDatabase('postgresql://localhost/draftila')).toThrow(
      'requires a SQLite file database',
    );
  });
});
