import RBush from 'rbush';
import type { Shape, Viewport } from '@draftila/shared';

export interface ShapeBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

const HIT_PADDING = 8;
const FRAME_LABEL_TOP_PADDING = 20;

function shapeToBBox(shape: Shape): ShapeBBox {
  const pad = needsPadding(shape.type) ? HIT_PADDING : 0;
  const topPad = shape.type === 'frame' ? FRAME_LABEL_TOP_PADDING : pad;
  return {
    minX: shape.x - pad,
    minY: shape.y - topPad,
    maxX: shape.x + shape.width + pad,
    maxY: shape.y + shape.height + pad,
    id: shape.id,
  };
}

function needsPadding(type: string): boolean {
  return type === 'line' || type === 'path';
}

export class SpatialIndex {
  private tree: RBush<ShapeBBox>;
  private bboxMap: Map<string, ShapeBBox>;

  constructor() {
    this.tree = new RBush();
    this.bboxMap = new Map();
  }

  rebuild(shapes: Shape[]) {
    this.tree.clear();
    this.bboxMap.clear();
    const items = shapes.map(shapeToBBox);
    for (const item of items) {
      this.bboxMap.set(item.id, item);
    }
    this.tree.load(items);
  }

  insert(shape: Shape) {
    const bbox = shapeToBBox(shape);
    this.bboxMap.set(shape.id, bbox);
    this.tree.insert(bbox);
  }

  update(shape: Shape) {
    this.remove(shape.id);
    this.insert(shape);
  }

  remove(id: string) {
    const existing = this.bboxMap.get(id);
    if (existing) {
      this.tree.remove(existing, (a, b) => a.id === b.id);
      this.bboxMap.delete(id);
    }
  }

  queryPoint(x: number, y: number): ShapeBBox[] {
    return this.tree.search({ minX: x, minY: y, maxX: x, maxY: y });
  }

  queryRect(minX: number, minY: number, maxX: number, maxY: number): ShapeBBox[] {
    return this.tree.search({ minX, minY, maxX, maxY });
  }

  queryViewport(viewport: Viewport): ShapeBBox[] {
    return this.tree.search({
      minX: viewport.minX,
      minY: viewport.minY,
      maxX: viewport.maxX,
      maxY: viewport.maxY,
    });
  }

  clear() {
    this.tree.clear();
    this.bboxMap.clear();
  }
}
