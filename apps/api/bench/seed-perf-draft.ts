import { db } from '../src/db';
import { nanoid } from '../src/common/lib/utils';
import { getShapesMap } from '@draftila/engine/scene-graph';
import { DEFAULT_GEN, docStateBytes, generateDoc } from './lib/gen-doc';

const SIZES = [1000, 2500, 5000];

const projectId = process.env['SEED_PROJECT_ID'];
if (!projectId) throw new Error('SEED_PROJECT_ID is required');

const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
if (!project) throw new Error(`Project ${projectId} not found`);

for (const size of SIZES) {
  const name = `Perf test — ${size.toLocaleString()} shapes`;
  const { ydoc } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });

  const shapes = getShapesMap(ydoc);
  ydoc.transact(() => {
    shapes.forEach((shape) => {
      if (shape.get('type') === 'text') shape.set('textAutoResize', 'none');
    });
  });

  const state = Buffer.from(docStateBytes(ydoc));
  ydoc.destroy();

  const existing = await db.draft.findFirst({
    where: { projectId, name },
    select: { id: true },
  });

  const timestamp = new Date();
  if (existing) {
    await db.draft.update({
      where: { id: existing.id },
      data: { yjsState: new Uint8Array(state), updatedAt: timestamp },
    });
    console.log(`updated ${name} (${existing.id}) — ${(state.byteLength / 1024).toFixed(0)} KB`);
  } else {
    const id = nanoid();
    await db.draft.create({
      data: {
        id,
        name,
        projectId,
        yjsState: new Uint8Array(state),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    console.log(`created ${name} (${id}) — ${(state.byteLength / 1024).toFixed(0)} KB`);
  }
}

await db.$disconnect();
