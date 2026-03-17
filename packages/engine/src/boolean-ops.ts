import type { Shape } from '@draftila/shared';
import paper from 'paper/dist/paper-core';
import {
  arrowToPath,
  ellipseToPath,
  lineToPath,
  polygonToPath,
  rectToPath,
  starToPath,
} from './path-gen';
import { transformPath, normalizePathToOrigin } from './path-gen';

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface BooleanResult {
  operation: BooleanOperation;
  sourceIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
  svgPathData: string;
  fillRule: 'nonzero' | 'evenodd';
}

let paperInitialized = false;

function ensurePaper() {
  if (paperInitialized) return;
  paper.setup(new paper.Size(1, 1));
  paper.settings.insertItems = false;
  paperInitialized = true;
}

export function getShapeSvgPath(shape: Shape): string | null {
  if (
    'svgPathData' in shape &&
    typeof shape.svgPathData === 'string' &&
    shape.svgPathData.length > 0
  ) {
    return shape.svgPathData;
  }

  switch (shape.type) {
    case 'rectangle': {
      const cr = (shape as Shape & { cornerRadius?: number }).cornerRadius ?? 0;
      return rectToPath(shape.width, shape.height, cr);
    }
    case 'ellipse':
      return ellipseToPath(shape.width, shape.height);
    case 'polygon': {
      const sides = (shape as Shape & { sides?: number }).sides ?? 6;
      return polygonToPath(shape.width, shape.height, sides);
    }
    case 'star': {
      const points = (shape as Shape & { points?: number }).points ?? 5;
      const innerRadius = (shape as Shape & { innerRadius?: number }).innerRadius ?? 0.38;
      return starToPath(shape.width, shape.height, points, innerRadius);
    }
    case 'line': {
      const x1 = (shape as Shape & { x1?: number }).x1 ?? 0;
      const y1 = (shape as Shape & { y1?: number }).y1 ?? 0;
      const x2 = (shape as Shape & { x2?: number }).x2 ?? shape.width;
      const y2 = (shape as Shape & { y2?: number }).y2 ?? 0;
      return lineToPath(x1, y1, x2, y2);
    }
    case 'arrow': {
      const x1 = (shape as Shape & { x1?: number }).x1 ?? 0;
      const y1 = (shape as Shape & { y1?: number }).y1 ?? 0;
      const x2 = (shape as Shape & { x2?: number }).x2 ?? shape.width;
      const y2 = (shape as Shape & { y2?: number }).y2 ?? 0;
      const startArrowhead =
        (shape as Shape & { startArrowhead?: boolean }).startArrowhead ?? false;
      const endArrowhead = (shape as Shape & { endArrowhead?: boolean }).endArrowhead ?? true;
      return arrowToPath(x1, y1, x2, y2, 2, startArrowhead, endArrowhead);
    }
    default:
      return null;
  }
}

export function isBooleanCompatibleShape(shape: Shape): boolean {
  return Boolean(getShapeSvgPath(shape));
}

function shapePathToWorld(shape: Shape): string | null {
  const localPath = getShapeSvgPath(shape);
  if (!localPath) return null;
  return transformPath(localPath, { translateX: shape.x, translateY: shape.y });
}

function createPaperPath(svgPathData: string): paper.PathItem {
  const item = paper.PathItem.create(svgPathData);
  return item;
}

export function computePathBoolean(
  shapes: Shape[],
  operation: BooleanOperation,
): BooleanResult | null {
  if (shapes.length < 2) return null;

  ensurePaper();

  const firstShape = shapes[0]!;
  const firstWorldPath = shapePathToWorld(firstShape);
  if (!firstWorldPath) return null;

  let current = createPaperPath(firstWorldPath);
  const opts = { insert: false };

  for (let i = 1; i < shapes.length; i++) {
    const nextShape = shapes[i]!;
    const nextWorldPath = shapePathToWorld(nextShape);
    if (!nextWorldPath) return null;

    const next = createPaperPath(nextWorldPath);

    try {
      switch (operation) {
        case 'union':
          current = current.unite(next, opts);
          break;
        case 'subtract':
          current = current.subtract(next, opts);
          break;
        case 'intersect':
          current = current.intersect(next, opts);
          break;
        case 'exclude':
          current = current.exclude(next, opts);
          break;
      }
    } catch {
      return null;
    }

    next.remove();
  }

  const resultPathData = current.pathData;
  current.remove();

  if (!resultPathData) return null;

  const { pathData: localPath, bounds } = normalizePathToOrigin(resultPathData);

  if (bounds.width === 0 && bounds.height === 0) return null;

  return {
    operation,
    sourceIds: shapes.map((s) => s.id),
    bounds,
    svgPathData: localPath,
    fillRule: 'evenodd',
  };
}

export function rectIntersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectUnion(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: maxX - x, height: maxY - y };
}

export function rectIntersection(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const maxX = Math.min(a.x + a.width, b.x + b.width);
  const maxY = Math.min(a.y + a.height, b.y + b.height);

  if (maxX <= x || maxY <= y) return null;
  return { x, y, width: maxX - x, height: maxY - y };
}
