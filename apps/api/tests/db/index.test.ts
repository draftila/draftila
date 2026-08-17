import { describe, expect, test } from 'bun:test';
import { db, sqliteReady } from '../../src/db';
import { env } from '../../src/common/lib/env';

describe.skipIf(env.DB_DRIVER !== 'sqlite')('sqlite pragmas', () => {
  test('journal_mode is WAL on the application client', async () => {
    await sqliteReady;

    const rows = await db.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode');

    expect(rows[0]?.journal_mode?.toLowerCase()).toBe('wal');
  });
});
