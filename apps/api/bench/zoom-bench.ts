import '../src/modules/mcp/dom-shim';
import { createCanvas } from '@napi-rs/canvas';
import type { Camera, Shape } from '@draftila/shared';
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { renderShape, getCornerRadii, simplifyShapeForZoom } from '@draftila/engine/shape-renderer';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { DEFAULT_GEN, generateDoc } from './lib/gen-doc';
import { formatTable, measure, type Timing } from './lib/stats';

const SHAPE_COUNT = 10000;
const VIEWPORT_W = 1600;
const VIEWPORT_H = 900;
const DPR = 2;
const ZOOMS = [1, 0.5, 0.25, 0.1, 0.05];

function docBounds(shapes: Shape[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    if (shape.x < minX) minX = shape.x;
    if (shape.y < minY) minY = shape.y;
    if (shape.x + shape.width > maxX) maxX = shape.x + shape.width;
    if (shape.y + shape.height > maxY) maxY = shape.y + shape.height;
  }
  return { minX, minY, maxX, maxY };
}

function cameraForZoom(shapes: Shape[], zoom: number): Camera {
  const bounds = docBounds(shapes);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: VIEWPORT_W / 2 - centerX * zoom,
    y: VIEWPORT_H / 2 - centerY * zoom,
    zoom,
  };
}

function renderFrame(renderer: Canvas2DRenderer, shapes: Shape[], camera: Camera) {
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

  const isShapeVisible = (shape: Shape): boolean => {
    if (!shape.visible) return false;
    let parentId = shape.parentId ?? null;
    while (parentId) {
      const parent = shapeMap.get(parentId);
      if (!parent || !parent.visible) return false;
      parentId = parent.parentId ?? null;
    }
    return true;
  };

  renderer.clear();
  renderer.fillBackground('#333333');
  renderer.save();
  renderer.applyCamera(camera);

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
  const { ydoc } = generateDoc({ shapeCount: SHAPE_COUNT, ...DEFAULT_GEN });
  const shapes = getAllShapes(ydoc);

  const index = new SpatialIndex();
  index.rebuild(shapes);

  const canvas = createCanvas(VIEWPORT_W * DPR, VIEWPORT_H * DPR);
  (canvas as unknown as Record<string, unknown>)['style'] = { width: '', height: '' };
  const renderer = new Canvas2DRenderer(canvas as unknown as HTMLCanvasElement);
  renderer.resize(VIEWPORT_W, VIEWPORT_H, DPR);

  const cacheCanvas = createCanvas(VIEWPORT_W * DPR, VIEWPORT_H * DPR);
  const cacheCtx = cacheCanvas.getContext('2d');
  const targetCtx = (canvas as unknown as HTMLCanvasElement).getContext(
    '2d',
  ) as unknown as CanvasRenderingContext2D;

  const rows: Timing[] = [];
  const facts: string[] = [];

  for (const zoom of ZOOMS) {
    const camera = cameraForZoom(shapes, zoom);
    const viewport = renderer.getViewport(camera);
    const visibleIds = new Set(index.queryViewport(viewport).map((box) => box.id));
    const culled = shapes.filter((shape) => visibleIds.has(shape.id));
    const simplified = culled.map((shape) => simplifyShapeForZoom(shape, zoom));
    const textDropped = culled.filter(
      (shape, i) => shape.type === 'text' && simplified[i]?.type !== 'text',
    ).length;

    facts.push(
      `zoom ${zoom.toFixed(2).padStart(4)}: ${String(culled.length).padStart(5)} / ${SHAPE_COUNT} shapes in viewport ` +
        `(${((culled.length / SHAPE_COUNT) * 100).toFixed(1).padStart(5)}%), text simplified: ${textDropped}`,
    );

    const label = `zoom ${zoom.toFixed(2)}`;
    const runs = culled.length > 4000 ? 12 : 25;

    rows.push(
      measure(`${label} · culled, full detail`, culled.length, runs, () =>
        renderFrame(renderer, culled, camera),
      ),
    );
    rows.push(
      measure(`${label} · culled + LOD simplification`, culled.length, runs, () =>
        renderFrame(renderer, simplified, camera),
      ),
    );

    renderFrame(renderer, culled, camera);
    cacheCtx.clearRect(0, 0, VIEWPORT_W * DPR, VIEWPORT_H * DPR);
    cacheCtx.drawImage(canvas as never, 0, 0);

    rows.push(
      measure(`${label} · blit cached raster`, culled.length, 60, () => {
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.clearRect(0, 0, VIEWPORT_W * DPR, VIEWPORT_H * DPR);
        targetCtx.drawImage(cacheCanvas as never, 0, 0);
        targetCtx.restore();
      }),
    );
  }

  ydoc.destroy();

  console.log(`\n=== VIEWPORT OCCUPANCY BY ZOOM (${SHAPE_COUNT} shapes, 1600x900) ===`);
  for (const fact of facts) console.log(fact);
  console.log('\n=== RENDER STRATEGY BY ZOOM ===');
  console.log(formatTable(rows));

  return { facts, rows };
}

const result = main();
await Bun.write(
  `${import.meta.dir}/results/zoom.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2),
);
