import '../src/modules/mcp/dom-shim';
import { createCanvas } from '@napi-rs/canvas';
import type { Camera, Shape } from '@draftila/shared';
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { renderShape, getCornerRadii } from '@draftila/engine/shape-renderer';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { DEFAULT_GEN, generateDoc } from './lib/gen-doc';
import { formatTable, measure, type Timing } from './lib/stats';

const SIZES = [100, 500, 1000, 2500, 5000, 10000];
const VIEWPORT_W = 1600;
const VIEWPORT_H = 900;
const CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

function renderFrame(renderer: Canvas2DRenderer, shapes: Shape[]) {
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

  const isShapeVisible = (shape: Shape): boolean => {
    if (!shape.visible) return false;
    let currentParentId = shape.parentId ?? null;
    while (currentParentId) {
      const parent = shapeMap.get(currentParentId);
      if (!parent || !parent.visible) return false;
      currentParentId = parent.parentId ?? null;
    }
    return true;
  };

  renderer.clear();
  renderer.fillBackground('#333333');
  renderer.save();
  renderer.applyCamera(CAMERA);

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
        renderer.endClip();
        clipStack.pop();
      } else {
        break;
      }
    }

    if (!isShapeVisible(shape)) continue;

    renderShape(renderer, shape);

    if (shape.type === 'frame') {
      renderer.beginClip(
        shape.x,
        shape.y,
        shape.width,
        shape.height,
        shape.rotation,
        getCornerRadii(shape as never),
      );
      clipStack.push(shape.id);
    }
  }

  while (clipStack.length > 0) {
    renderer.endClip();
    clipStack.pop();
  }

  renderer.restore();
}

function main() {
  const rows: Timing[] = [];
  const facts: string[] = [];

  for (const size of SIZES) {
    const { ydoc } = generateDoc({ shapeCount: size, ...DEFAULT_GEN });
    const shapes = getAllShapes(ydoc);

    const canvas = createCanvas(VIEWPORT_W, VIEWPORT_H);
    (canvas as unknown as Record<string, unknown>)['style'] = { width: '', height: '' };
    const renderer = new Canvas2DRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(VIEWPORT_W, VIEWPORT_H, 2);

    const index = new SpatialIndex();
    index.rebuild(shapes);
    const viewport = renderer.getViewport(CAMERA);
    const visibleIds = new Set(index.queryViewport(viewport).map((box) => box.id));
    const culled = shapes.filter((shape) => visibleIds.has(shape.id));

    facts.push(`n=${size}: drawn now=${shapes.length}, drawn if culled=${culled.length}`);

    const runs = size >= 5000 ? 15 : 30;
    rows.push(
      measure('render frame: ALL shapes (current)', size, runs, () =>
        renderFrame(renderer, shapes),
      ),
    );
    rows.push(
      measure('render frame: viewport-culled only', size, runs, () =>
        renderFrame(renderer, culled),
      ),
    );

    ydoc.destroy();
  }

  console.log('\n=== RENDER FACTS ===');
  for (const fact of facts) console.log(fact);
  console.log('\n=== CANVAS RASTERIZATION (1600x900 @ dpr 2) ===');
  console.log(formatTable(rows));

  return { facts, rows };
}

const result = main();
await Bun.write(
  `${import.meta.dir}/results/render.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2),
);
