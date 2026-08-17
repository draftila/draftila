import * as Y from 'yjs';
import { PrismaClient as PostgresqlPrismaClient } from '../src/generated/prisma/postgresql-client';
import { PrismaClient as SqlitePrismaClient } from '../src/generated/prisma/sqlite-client';
import { getShapesMap } from '@draftila/engine/scene-graph';
import { DEFAULT_GEN, docStateBytes, generateDoc } from './lib/gen-doc';
import { formatTable, measureAsync, type Timing } from './lib/stats';

const SIZES = [1000, 5000, 10000];
const EDITS_PER_INTERVAL = 40;

type Driver = 'postgresql' | 'sqlite';

function createClient(driver: Driver, url: string) {
  return driver === 'sqlite'
    ? (new SqlitePrismaClient({
        datasources: { db: { url } },
      }) as unknown as PostgresqlPrismaClient)
    : new PostgresqlPrismaClient({ datasources: { db: { url } } });
}

async function run(driver: Driver, url: string) {
  const db = createClient(driver, url);
  const blobType = driver === 'sqlite' ? 'BLOB' : 'BYTEA';

  await db.$executeRawUnsafe('DROP TABLE IF EXISTS bench_update_log');
  await db.$executeRawUnsafe(
    `CREATE TABLE bench_update_log (id SERIAL PRIMARY KEY, draft_id TEXT NOT NULL, payload ${blobType} NOT NULL)`.replace(
      'SERIAL PRIMARY KEY',
      driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY',
    ),
  );
  await db.$executeRawUnsafe(
    'CREATE INDEX bench_update_log_draft_idx ON bench_update_log (draft_id, id)',
  );

  const rows: Timing[] = [];
  const facts: string[] = [];

  for (const size of SIZES) {
    const { ydoc, shapeIds } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });
    const fullState = Buffer.from(docStateBytes(ydoc));
    const draftId = `bench-draft-${size}`;

    const updatesSeen: Uint8Array[] = [];
    const collect = (update: Uint8Array) => updatesSeen.push(update);
    ydoc.on('update', collect);

    const shapesMap = getShapesMap(ydoc);
    for (let i = 0; i < EDITS_PER_INTERVAL; i++) {
      const shape = shapesMap.get(shapeIds[i % shapeIds.length]!);
      if (!shape) throw new Error('bench shape missing');
      ydoc.transact(() => shape.set('x', 100 + i));
    }
    ydoc.off('update', collect);

    if (updatesSeen.length !== EDITS_PER_INTERVAL) {
      throw new Error(`expected ${EDITS_PER_INTERVAL} updates, got ${updatesSeen.length}`);
    }
    const mergedDelta = Buffer.from(Y.mergeUpdates(updatesSeen));

    facts.push(
      `n=${size}: full state=${(fullState.byteLength / 1024).toFixed(1)}KB, ` +
        `merged delta for ${EDITS_PER_INTERVAL} edits=${(mergedDelta.byteLength / 1024).toFixed(2)}KB ` +
        `(${(fullState.byteLength / mergedDelta.byteLength).toFixed(0)}x smaller)`,
    );

    await db.$executeRawUnsafe(
      'DELETE FROM bench_update_log WHERE draft_id = $1'.replace('$1', `'${draftId}'`),
    );

    rows.push(
      await measureAsync('CURRENT: full-state UPDATE', size, 20, async () => {
        await db.draft.update({
          where: { id: draftId },
          data: { yjsState: new Uint8Array(fullState) },
        });
      }),
    );

    rows.push(
      await measureAsync('PROPOSED: append merged delta', size, 20, async () => {
        await db.$executeRawUnsafe(
          driver === 'sqlite'
            ? 'INSERT INTO bench_update_log (draft_id, payload) VALUES (?, ?)'
            : 'INSERT INTO bench_update_log (draft_id, payload) VALUES ($1, $2)',
          draftId,
          mergedDelta,
        );
      }),
    );

    ydoc.destroy();
  }

  await db.$executeRawUnsafe('DROP TABLE IF EXISTS bench_update_log');
  await db.$disconnect();
  return { rows, facts };
}

const driver = (process.env['BENCH_DRIVER'] ?? 'sqlite') as Driver;
const url = process.env['BENCH_URL'];
if (!url) throw new Error('BENCH_URL is required');

const result = await run(driver, url);
console.log(`\n=== INCREMENTAL vs FULL-STATE PERSISTENCE (${driver}) ===`);
for (const fact of result.facts) console.log(fact);
console.log();
console.log(formatTable(result.rows));

await Bun.write(
  `${import.meta.dir}/results/incremental-${driver}.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2),
);
