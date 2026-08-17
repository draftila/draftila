import { Database } from 'bun:sqlite';
import { PrismaClient as SqlitePrismaClient } from '../src/generated/prisma/sqlite-client';
import { DEFAULT_GEN, docStateBytes, generateDoc } from './lib/gen-doc';
import { formatTable, measureAsync, type Timing } from './lib/stats';

const SIZES = [1000, 5000, 10000];

async function benchAt(path: string, label: string, journalMode: 'delete' | 'wal') {
  const raw = new Database(path);
  raw.exec(`PRAGMA journal_mode = ${journalMode};`);
  raw.exec(journalMode === 'wal' ? 'PRAGMA synchronous = NORMAL;' : 'PRAGMA synchronous = FULL;');
  const mode = raw.query('PRAGMA journal_mode;').get() as { journal_mode: string };
  raw.close();

  const db = new SqlitePrismaClient({ datasources: { db: { url: `file:${path}` } } });
  const rows: Timing[] = [];

  for (const size of SIZES) {
    const { ydoc } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });
    const state = Buffer.from(docStateBytes(ydoc));
    const draftId = `bench-draft-${size}`;
    rows.push(
      await measureAsync(`saveYjsState [${label}]`, size, 20, async () => {
        await db.draft.update({
          where: { id: draftId },
          data: { yjsState: new Uint8Array(state) },
        });
      }),
    );
    ydoc.destroy();
  }

  await db.$disconnect();
  return { rows, actualMode: mode.journal_mode };
}

const path = process.env['BENCH_SQLITE_PATH'];
if (!path) throw new Error('BENCH_SQLITE_PATH is required');

const rollback = await benchAt(path, 'journal=delete sync=FULL (current)', 'delete');
const wal = await benchAt(path, 'journal=WAL sync=NORMAL', 'wal');

console.log(`\n=== SQLITE JOURNAL MODE COMPARISON ===`);
console.log(`modes actually applied: ${rollback.actualMode} vs ${wal.actualMode}\n`);
console.log(formatTable([...rollback.rows, ...wal.rows]));

await Bun.write(
  `${import.meta.dir}/results/sqlite-wal.json`,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), rollback: rollback.rows, wal: wal.rows },
    null,
    2,
  ),
);
