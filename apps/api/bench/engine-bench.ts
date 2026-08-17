import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getResolvedShapes } from '@draftila/engine';
import { getLayerTree, getAllShapes, addShape, observeShapes } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { hitTestPoint } from '@draftila/engine/hit-test';
import { opUpdateShape } from '@draftila/engine/operations';
import { DEFAULT_GEN, generateDoc, docStateBytes } from './lib/gen-doc';
import { formatTable, measure, summarize, type Timing } from './lib/stats';

const SIZES = [100, 500, 1000, 2500, 5000, 10000];

function drawBookkeeping(shapes: Shape[]): number {
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

  const isShapeVisible = (shape: Shape): boolean => {
    if (!shape.visible) return false;
    let currentParentId = shape.parentId ?? null;
    while (currentParentId) {
      const parent = shapeMap.get(currentParentId);
      if (!parent) return false;
      if (!parent.visible) return false;
      currentParentId = parent.parentId ?? null;
    }
    return true;
  };

  const shapePositions = new Map<string, { x: number; y: number }>();
  for (const shape of shapes) {
    shapePositions.set(shape.id, { x: shape.x, y: shape.y });
  }

  let visited = 0;
  const clipStack: string[] = [];
  for (const shape of shapes) {
    while (clipStack.length > 0) {
      const clipParentId = clipStack[clipStack.length - 1]!;
      let isDescendant = false;
      let checkId: string | null = shape.parentId ?? null;
      while (checkId) {
        if (checkId === clipParentId) {
          isDescendant = true;
          break;
        }
        checkId = shapeMap.get(checkId)?.parentId ?? null;
      }
      if (!isDescendant) {
        clipStack.pop();
      } else {
        break;
      }
    }

    if (!isShapeVisible(shape)) continue;
    visited++;
    if (shape.type === 'frame') clipStack.push(shape.id);
  }
  return visited;
}

function countInViewport(shapes: Shape[], index: SpatialIndex): number {
  return index.queryViewport({ minX: 0, minY: 0, maxX: 1600, maxY: 900 }).length;
}

async function main() {
  const rows: Timing[] = [];
  const sizeFacts: string[] = [];

  for (const size of SIZES) {
    const { ydoc, frameIds } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });
    const shapes = getAllShapes(ydoc);
    const stateBytes = docStateBytes(ydoc).byteLength;

    const index = new SpatialIndex();
    index.rebuild(shapes);
    const visible = countInViewport(shapes, index);

    sizeFacts.push(
      `n=${size}: yjsState=${(stateBytes / 1024).toFixed(1)}KB (${Math.round(stateBytes / size)}B/shape), shapes in 1600x900 viewport=${visible} (${((visible / size) * 100).toFixed(1)}%)`,
    );

    const runs = size >= 5000 ? 20 : 50;

    rows.push(
      measure('getResolvedShapes (per yjs change)', size, runs, () => getResolvedShapes(ydoc)),
    );
    rows.push(measure('getLayerTree (per yjs change)', size, runs, () => getLayerTree(ydoc)));
    rows.push(
      measure('SpatialIndex.rebuild (per pointer event)', size, runs, () => {
        const fresh = new SpatialIndex();
        fresh.rebuild(shapes);
      }),
    );
    rows.push(
      measure('hitTestPoint (incl. fresh index, as in canvas.tsx)', size, runs, () => {
        const fresh = new SpatialIndex();
        fresh.rebuild(shapes);
        hitTestPoint(800, 450, shapes, fresh, 1);
      }),
    );
    rows.push(
      measure('hitTestPoint (reusing cached index)', size, runs, () =>
        hitTestPoint(800, 450, shapes, index, 1),
      ),
    );
    rows.push(measure('draw() bookkeeping per frame', size, runs, () => drawBookkeeping(shapes)));
    rows.push(
      measure('Y.encodeStateAsUpdate (autosave)', size, Math.min(runs, 20), () =>
        Y.encodeStateAsUpdate(ydoc),
      ),
    );

    const update = Y.encodeStateAsUpdate(ydoc);
    rows.push(
      measure('Y.applyUpdate into fresh doc (room load)', size, Math.min(runs, 20), () => {
        const fresh = new Y.Doc();
        Y.applyUpdate(fresh, update);
      }),
    );

    const targetFrame = frameIds[Math.floor(frameIds.length / 2)]!;
    rows.push(
      measure('addShape into existing frame', size, Math.min(runs, 15), () => {
        addShape(ydoc, 'rectangle', { parentId: targetFrame, x: 10, y: 10 } as Partial<Shape>);
      }),
    );

    const dragTarget = shapes[Math.floor(shapes.length / 2)]!;
    const unobserve = observeShapes(ydoc, () => {
      getResolvedShapes(ydoc);
      getLayerTree(ydoc);
      const rebuilt = new SpatialIndex();
      rebuilt.rebuild(getAllShapes(ydoc));
    });
    const dragSamples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      opUpdateShape(ydoc, dragTarget.id, { x: dragTarget.x + i } as Partial<Shape>);
      dragSamples.push(performance.now() - start);
    }
    unobserve();
    rows.push(summarize('drag tick: 1 move -> observers refresh', size, dragSamples));

    ydoc.destroy();
  }

  console.log('\n=== DOCUMENT FACTS ===');
  for (const fact of sizeFacts) console.log(fact);
  console.log('\n=== ENGINE / FRONTEND HOT PATHS ===');
  console.log(formatTable(rows));

  const json = { generatedAt: new Date().toISOString(), facts: sizeFacts, rows };
  await Bun.write(`${import.meta.dir}/results/engine.json`, JSON.stringify(json, null, 2));
}

await main();
