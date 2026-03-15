import type { Shape } from '@draftila/shared';
import type { SpatialIndex } from './spatial-index';
import { generatePolygonPoints, generateStarPoints } from './shape-renderer';

const LINE_HIT_TOLERANCE = 8;
const FRAME_BORDER_TOLERANCE = 6;
const FRAME_LABEL_FONT_SIZE = 11;
const FRAME_LABEL_OFFSET_Y = 4;

function rotatePointAroundCenter(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleDeg: number,
): { x: number; y: number } {
  const angle = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return { x: dx * cos - dy * sin + cx, y: dx * sin + dy * cos + cy };
}

function pointInRect(px: number, py: number, shape: Shape): boolean {
  let testX = px;
  let testY = py;

  if (shape.rotation !== 0) {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const rotated = rotatePointAroundCenter(px, py, cx, cy, shape.rotation);
    testX = rotated.x;
    testY = rotated.y;
  }

  return (
    testX >= shape.x &&
    testX <= shape.x + shape.width &&
    testY >= shape.y &&
    testY <= shape.y + shape.height
  );
}

function pointInEllipse(px: number, py: number, shape: Shape): boolean {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const rx = shape.width / 2;
  const ry = shape.height / 2;

  let dx = px - cx;
  let dy = py - cy;

  if (shape.rotation !== 0) {
    const rotated = rotatePointAroundCenter(px, py, cx, cy, shape.rotation);
    dx = rotated.x - cx;
    dy = rotated.y - cy;
  }

  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function pointInPolygonRayCast(px: number, py: number, vertices: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i]![0];
    const yi = vertices[i]![1];
    const xj = vertices[j]![0];
    const yj = vertices[j]![1];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function pointNearPath(
  px: number,
  py: number,
  shape: Shape & { points: Array<{ x: number; y: number }> },
  tolerance: number,
): boolean {
  if (shape.points.length < 2) return false;

  for (let i = 0; i < shape.points.length - 1; i++) {
    const p1 = shape.points[i]!;
    const p2 = shape.points[i + 1]!;
    if (distanceToLineSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= tolerance) {
      return true;
    }
  }

  return pointInRect(px, py, shape);
}

function pointOnFrameBorder(px: number, py: number, shape: Shape, zoom: number): boolean {
  const tolerance = FRAME_BORDER_TOLERANCE / zoom;
  const inside = pointInRect(px, py, shape);
  if (!inside) return false;

  const distLeft = Math.abs(px - shape.x);
  const distRight = Math.abs(px - (shape.x + shape.width));
  const distTop = Math.abs(py - shape.y);
  const distBottom = Math.abs(py - (shape.y + shape.height));

  return (
    distLeft <= tolerance ||
    distRight <= tolerance ||
    distTop <= tolerance ||
    distBottom <= tolerance
  );
}

function hasAncestorMatch(
  shape: Shape,
  shapeMap: Map<string, Shape>,
  predicate: (ancestor: Shape) => boolean,
): boolean {
  let currentParentId = shape.parentId ?? null;

  while (currentParentId) {
    const parent = shapeMap.get(currentParentId);
    if (!parent) return false;
    if (predicate(parent)) return true;
    currentParentId = parent.parentId ?? null;
  }

  return false;
}

function isEffectivelyVisible(shape: Shape, shapeMap: Map<string, Shape>): boolean {
  if (!shape.visible) return false;
  return !hasAncestorMatch(shape, shapeMap, (ancestor) => !ancestor.visible);
}

function isEffectivelyLocked(shape: Shape, shapeMap: Map<string, Shape>): boolean {
  if (shape.locked) return true;
  return hasAncestorMatch(shape, shapeMap, (ancestor) => ancestor.locked);
}

export function hitTestFrameLabel(
  px: number,
  py: number,
  shape: Shape,
  zoom: number,
  labelWidth?: number,
): boolean {
  if (shape.type !== 'frame') return false;
  const fontSize = FRAME_LABEL_FONT_SIZE / zoom;
  const offsetY = FRAME_LABEL_OFFSET_Y / zoom;
  const estimatedWidth = labelWidth ?? shape.name.length * fontSize * 0.6;

  const labelX = shape.x;
  const labelY = shape.y - offsetY - fontSize;
  const labelW = estimatedWidth;
  const labelH = fontSize + offsetY;

  return px >= labelX && px <= labelX + labelW && py >= labelY && py <= labelY + labelH;
}

function narrowPhaseHitTest(px: number, py: number, shape: Shape, zoom: number): boolean {
  switch (shape.type) {
    case 'rectangle':
    case 'text':
    case 'image':
    case 'group':
      return pointInRect(px, py, shape);

    case 'frame':
      return pointOnFrameBorder(px, py, shape, zoom) || hitTestFrameLabel(px, py, shape, zoom);

    case 'ellipse':
      return pointInEllipse(px, py, shape);

    case 'path':
      return pointNearPath(px, py, shape, LINE_HIT_TOLERANCE / zoom);

    case 'polygon': {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const vertices = generatePolygonPoints(
        cx,
        cy,
        shape.width / 2,
        shape.height / 2,
        shape.sides,
      );
      return pointInPolygonRayCast(px, py, vertices);
    }

    case 'star': {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const vertices = generateStarPoints(
        cx,
        cy,
        shape.width / 2,
        shape.height / 2,
        shape.points as number,
        shape.innerRadius,
      );
      return pointInPolygonRayCast(px, py, vertices);
    }

    case 'line': {
      const tolerance = LINE_HIT_TOLERANCE / zoom;
      return distanceToLineSegment(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= tolerance;
    }

    case 'arrow': {
      const tolerance = LINE_HIT_TOLERANCE / zoom;
      return distanceToLineSegment(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= tolerance;
    }

    default:
      return false;
  }
}

export function hitTestPoint(
  px: number,
  py: number,
  shapes: Shape[],
  spatialIndex: SpatialIndex,
  zoom = 1,
): Shape | null {
  const candidates = spatialIndex.queryPoint(px, py);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (!shape || !candidateIds.has(shape.id)) continue;
    if (isEffectivelyLocked(shape, shapeMap) || !isEffectivelyVisible(shape, shapeMap)) continue;
    if (shape.type === 'frame') continue;
    if (narrowPhaseHitTest(px, py, shape, zoom)) {
      return shape;
    }
  }

  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (!shape || shape.type !== 'frame') continue;
    if (isEffectivelyLocked(shape, shapeMap) || !isEffectivelyVisible(shape, shapeMap)) continue;
    if (hitTestFrameLabel(px, py, shape, zoom)) {
      return shape;
    }
    if (candidateIds.has(shape.id) && pointOnFrameBorder(px, py, shape, zoom)) {
      return shape;
    }
  }

  return null;
}

export function hitTestRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  shapes: Shape[],
  spatialIndex: SpatialIndex,
): Shape[] {
  const candidates = spatialIndex.queryRect(minX, minY, maxX, maxY);
  if (candidates.length === 0) return [];

  const candidateIds = new Set(candidates.map((c) => c.id));
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));
  const result: Shape[] = [];

  for (const shape of shapes) {
    if (!candidateIds.has(shape.id)) continue;
    if (isEffectivelyLocked(shape, shapeMap) || !isEffectivelyVisible(shape, shapeMap)) continue;

    const shapeMinX = shape.x;
    const shapeMinY = shape.y;
    const shapeMaxX = shape.x + shape.width;
    const shapeMaxY = shape.y + shape.height;

    if (shapeMinX >= minX && shapeMinY >= minY && shapeMaxX <= maxX && shapeMaxY <= maxY) {
      result.push(shape);
    }
  }

  return result;
}
