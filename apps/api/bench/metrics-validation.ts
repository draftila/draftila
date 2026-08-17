process.env['METRICS_ENABLED'] = 'true';
process.env['SLOW_QUERY_MS'] = process.env['SLOW_QUERY_MS'] ?? '25';
process.env['DB_DRIVER'] = process.env['BENCH_DRIVER'] ?? 'sqlite';
process.env['DATABASE_URL'] = process.env['BENCH_URL'] ?? '';
process.env['BETTER_AUTH_SECRET'] =
  process.env['BETTER_AUTH_SECRET'] ?? 'bench-secret-key-that-is-long-enough-32';
process.env['BETTER_AUTH_URL'] = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3001';

import { DEFAULT_GEN, docStateBytes, generateDoc } from './lib/gen-doc';

const SIZES = [1000, 5000, 10000];

const { db } = await import('../src/db');
const collaboration = await import('../src/modules/collaboration/collaboration.service');
const draftsService = await import('../src/modules/drafts/drafts.service');
const { metricsSnapshot, resetMetrics } = await import('../src/common/lib/metrics');
const { getShapesMap } = await import('@draftila/engine/scene-graph');

const driver = process.env['DB_DRIVER'];

await db.user.upsert({
  where: { id: 'metrics-user' },
  create: {
    id: 'metrics-user',
    name: 'Metrics',
    email: 'metrics@draftila.test',
    updatedAt: new Date(),
  },
  update: {},
});
await db.project.upsert({
  where: { id: 'metrics-project' },
  create: {
    id: 'metrics-project',
    name: 'Metrics',
    ownerId: 'metrics-user',
    updatedAt: new Date(),
  },
  update: {},
});

resetMetrics();

for (const size of SIZES) {
  const draftId = `metrics-draft-${size}`;
  const { ydoc, shapeIds } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });
  const state = Buffer.from(docStateBytes(ydoc));

  await db.draft.upsert({
    where: { id: draftId },
    create: {
      id: draftId,
      name: `Metrics ${size}`,
      projectId: 'metrics-project',
      updatedAt: new Date(),
    },
    update: {},
  });
  await draftsService.saveYjsState(draftId, state);
  ydoc.destroy();

  const room = await collaboration.getOrCreateRoom(draftId);

  const roomShapes = getShapesMap(room.ydoc);
  for (let i = 0; i < 20; i++) {
    const shape = roomShapes.get(shapeIds[i % shapeIds.length]!);
    if (shape) room.ydoc.transact(() => shape.set('x', 500 + i));
  }

  await collaboration.closeRoom(draftId);
}

const snapshot = metricsSnapshot();

console.log(`\n=== BACKEND METRICS VALIDATION (${driver}) ===`);
console.log(`sizes exercised: ${SIZES.join(', ')} shapes\n`);

console.log('durations:');
for (const [name, value] of Object.entries(snapshot.durations)) {
  const entry = value as { count: number; meanMs: number; p95Ms: number; maxMs: number };
  console.log(
    `  ${name.padEnd(42)} n=${String(entry.count).padStart(3)}  mean=${entry.meanMs.toFixed(2).padStart(8)}ms  p95=${entry.p95Ms.toFixed(2).padStart(8)}ms  max=${entry.maxMs.toFixed(2).padStart(8)}ms`,
  );
}

console.log('\nvalues:');
for (const [name, value] of Object.entries(snapshot.values)) {
  const entry = value as { count: number; mean: number; min: number; max: number };
  console.log(
    `  ${name.padEnd(42)} n=${String(entry.count).padStart(3)}  mean=${entry.mean}  min=${entry.min}  max=${entry.max}`,
  );
}

console.log('\ncounters:', JSON.stringify(snapshot.counters));

await Bun.write(
  `${import.meta.dir}/results/metrics-${driver}.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), driver, snapshot }, null, 2),
);

await db.$disconnect();
process.exit(0);
