import * as Y from 'yjs';
import { PrismaClient as PostgresqlPrismaClient } from '../src/generated/prisma/postgresql-client';
import { PrismaClient as SqlitePrismaClient } from '../src/generated/prisma/sqlite-client';
import { DEFAULT_GEN, docStateBytes, generateDoc } from './lib/gen-doc';
import { formatTable, measureAsync, summarize, type Timing } from './lib/stats';

const SIZES = [100, 500, 1000, 2500, 5000, 10000];
const AUTO_SAVE_CAP = 50;

type Driver = 'postgresql' | 'sqlite';

interface QueryLog {
  query: string;
  durationMs: number;
}

function createClient(driver: Driver, url: string, log: QueryLog[]) {
  const options = {
    datasources: { db: { url } },
    log: [{ emit: 'event', level: 'query' } as const],
  };
  const client =
    driver === 'sqlite'
      ? (new SqlitePrismaClient(options) as unknown as PostgresqlPrismaClient)
      : new PostgresqlPrismaClient(options);

  (client as unknown as { $on: (event: string, cb: (e: never) => void) => void }).$on(
    'query',
    ((event: { query: string; duration: number }) => {
      log.push({ query: event.query, durationMs: event.duration });
    }) as never,
  );

  return client;
}

async function seedOwner(db: PostgresqlPrismaClient) {
  const userId = 'bench-user';
  const projectId = 'bench-project';
  await db.user.upsert({
    where: { id: userId },
    create: { id: userId, name: 'Bench', email: 'bench@draftila.test', updatedAt: new Date() },
    update: {},
  });
  await db.project.upsert({
    where: { id: projectId },
    create: { id: projectId, name: 'Bench', ownerId: userId, updatedAt: new Date() },
    update: {},
  });
  return { userId, projectId };
}

async function run(driver: Driver, url: string) {
  const queryLog: QueryLog[] = [];
  const db = createClient(driver, url, queryLog);
  const { userId, projectId } = await seedOwner(db);

  const rows: Timing[] = [];
  const facts: string[] = [];

  await db.snapshot.deleteMany({});
  await db.draft.deleteMany({ where: { projectId } });

  for (const size of SIZES) {
    const { ydoc } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });
    const state = Buffer.from(docStateBytes(ydoc));
    const draftId = `bench-draft-${size}`;

    await db.draft.create({
      data: { id: draftId, name: `Bench ${size}`, projectId, updatedAt: new Date() },
    });

    facts.push(`n=${size}: blob=${(state.byteLength / 1024).toFixed(1)}KB`);

    rows.push(
      await measureAsync('saveYjsState (30s autosave UPDATE)', size, 20, async () => {
        await db.draft.update({
          where: { id: draftId },
          data: { yjsState: new Uint8Array(state) },
        });
      }),
    );

    rows.push(
      await measureAsync('loadYjsState (room open SELECT)', size, 20, async () => {
        await db.draft.findUnique({ where: { id: draftId }, select: { yjsState: true } });
      }),
    );

    rows.push(
      await measureAsync('open draft: load + Y.applyUpdate', size, 10, async () => {
        const result = await db.draft.findUnique({
          where: { id: draftId },
          select: { yjsState: true },
        });
        const fresh = new Y.Doc();
        if (result?.yjsState) Y.applyUpdate(fresh, new Uint8Array(result.yjsState));
        fresh.destroy();
      }),
    );

    let snapshotSeq = 0;
    rows.push(
      await measureAsync('createAutoSave + pruneAutoSaves', size, 15, async () => {
        snapshotSeq++;
        await db.snapshot.create({
          data: {
            id: `snap-${size}-${snapshotSeq}`,
            draftId,
            userId,
            name: null,
            yjsState: new Uint8Array(state),
            createdAt: new Date(Date.now() + snapshotSeq),
          },
        });
        const autoSaves = await db.snapshot.findMany({
          where: { draftId, name: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });
        if (autoSaves.length > AUTO_SAVE_CAP) {
          await db.snapshot.deleteMany({
            where: { id: { in: autoSaves.slice(AUTO_SAVE_CAP).map((s) => s.id) } },
          });
        }
      }),
    );

    rows.push(
      await measureAsync('listSnapshots (named only)', size, 20, async () => {
        await db.snapshot.findMany({
          where: { draftId, NOT: { name: null } },
          select: { id: true, draftId: true, userId: true, name: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        });
      }),
    );

    const storedSnapshots = await db.snapshot.count({ where: { draftId } });
    facts.push(
      `n=${size}: snapshot rows retained=${storedSnapshots}, on-disk snapshot bytes≈${((storedSnapshots * state.byteLength) / 1024 / 1024).toFixed(1)}MB`,
    );

    ydoc.destroy();
  }

  rows.push(
    await measureAsync('listByProject (20 drafts, list select)', 0, 20, async () => {
      await db.draft.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          projectId: true,
          thumbnail: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 21,
      });
    }),
  );

  const concurrentSize = 5000;
  const { ydoc: concurrentDoc } = generateDoc({ shapeCount: concurrentSize, ...DEFAULT_GEN });
  const concurrentState = Buffer.from(docStateBytes(concurrentDoc));
  const concurrentIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = `bench-concurrent-${i}`;
    concurrentIds.push(id);
    await db.draft.upsert({
      where: { id },
      create: { id, name: `Concurrent ${i}`, projectId, updatedAt: new Date() },
      update: {},
    });
  }
  concurrentDoc.destroy();

  const concurrentSamples: number[] = [];
  for (let round = 0; round < 8; round++) {
    const start = performance.now();
    await Promise.all(
      concurrentIds.map((id) =>
        db.draft.update({ where: { id }, data: { yjsState: new Uint8Array(concurrentState) } }),
      ),
    );
    concurrentSamples.push(performance.now() - start);
  }
  rows.push(
    summarize('10 concurrent room autosaves (5k shapes each)', concurrentSize, concurrentSamples),
  );

  const slowest = [...queryLog].sort((a, b) => b.durationMs - a.durationMs).slice(0, 8);

  await db.$disconnect();
  return { driver, rows, facts, slowest, queryCount: queryLog.length };
}

const driver = (process.env['BENCH_DRIVER'] ?? 'sqlite') as Driver;
const url = process.env['BENCH_URL'];
if (!url) throw new Error('BENCH_URL is required');

const result = await run(driver, url);

console.log(`\n=== DB FACTS (${driver}) ===`);
for (const fact of result.facts) console.log(fact);
console.log(`\n=== DB TIMINGS (${driver}) ===`);
console.log(formatTable(result.rows));
console.log(`slowest raw queries (${driver}), of ${result.queryCount} total:`);
for (const entry of result.slowest) {
  console.log(`  ${entry.durationMs.toFixed(1)}ms  ${entry.query.slice(0, 110)}`);
}

await Bun.write(
  `${import.meta.dir}/results/db-${driver}.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2),
);
