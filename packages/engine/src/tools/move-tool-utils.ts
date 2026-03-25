import type { Shape } from '@draftila/shared';
import type { HandlePosition } from '../selection';
import type { ResizeSnapEdges } from '../snap';
import { transformPath } from '../path-gen';

export type ConstraintHorizontal = 'left' | 'right' | 'left-right' | 'center' | 'scale';
export type ConstraintVertical = 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale';

export interface ConstraintShapeData {
  constraintHorizontal?: ConstraintHorizontal;
  constraintVertical?: ConstraintVertical;
  layoutMode?: string;
}

export interface InitialShapeData {
  x: number;
  y: number;
  width: number;
  height: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: Array<{ x: number; y: number; pressure: number }>;
  svgPathData?: string;
  shapeType: string;
}

export type MoveState =
  | { type: 'idle' }
  | {
      type: 'dragging';
      startCanvas: { x: number; y: number };
      initialData: Map<string, InitialShapeData>;
    }
  | { type: 'marquee'; startCanvas: { x: number; y: number }; preMarqueeIds: string[] }
  | {
      type: 'resizing';
      handle: HandlePosition;
      startCanvas: { x: number; y: number };
      initialData: Map<string, InitialShapeData>;
      selectionBounds: { x: number; y: number; width: number; height: number };
    }
  | {
      type: 'rotating';
      center: { x: number; y: number };
      initialRotations: Map<string, number>;
    }
  | {
      type: 'dragging-endpoint';
      endpoint: 'line-start' | 'line-end';
      shapeId: string;
      initialData: InitialShapeData;
      startCanvas: { x: number; y: number };
    }
  | {
      type: 'dragging-guide';
      guideId: string;
      axis: 'x' | 'y';
      startPosition: number;
    };

export interface ResizePreviewEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Array<{ x: number; y: number; pressure: number }>;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  svgPathData?: string;
}

export function captureShapeData(shape: Shape): InitialShapeData {
  const data: InitialShapeData = {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    shapeType: shape.type,
  };
  if (shape.type === 'line') {
    data.x1 = shape.x1;
    data.y1 = shape.y1;
    data.x2 = shape.x2;
    data.y2 = shape.y2;
  }
  if (shape.type === 'path') {
    data.points = shape.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure }));
  }
  if ('svgPathData' in shape && typeof shape.svgPathData === 'string') {
    data.svgPathData = shape.svgPathData;
  }
  return data;
}

export function buildMoveUpdate(initial: InitialShapeData, dx: number, dy: number): Partial<Shape> {
  const update: Record<string, unknown> = {
    x: initial.x + dx,
    y: initial.y + dy,
  };
  if (initial.x1 !== undefined) update.x1 = initial.x1 + dx;
  if (initial.y1 !== undefined) update.y1 = initial.y1 + dy;
  if (initial.x2 !== undefined) update.x2 = initial.x2 + dx;
  if (initial.y2 !== undefined) update.y2 = initial.y2 + dy;
  if (initial.points) {
    update.points = initial.points.map((p) => ({
      x: p.x + dx,
      y: p.y + dy,
      pressure: p.pressure,
    }));
  }
  return update as Partial<Shape>;
}

export function buildResizeEntry(
  initial: InitialShapeData,
  oldBounds: { x: number; y: number; width: number; height: number },
  newBounds: { x: number; y: number; width: number; height: number },
): ResizePreviewEntry {
  const scaleX = oldBounds.width > 0 ? newBounds.width / oldBounds.width : 1;
  const scaleY = oldBounds.height > 0 ? newBounds.height / oldBounds.height : 1;

  const relX = initial.x - oldBounds.x;
  const relY = initial.y - oldBounds.y;

  const newWidth = Math.max(1, initial.width * scaleX);
  const newHeight = Math.max(1, initial.height * scaleY);

  const entry: ResizePreviewEntry = {
    x: newBounds.x + relX * scaleX,
    y: newBounds.y + relY * scaleY,
    width: newWidth,
    height: newHeight,
  };

  if (initial.points) {
    entry.points = initial.points.map((p) => ({
      x: newBounds.x + (p.x - oldBounds.x) * scaleX,
      y: newBounds.y + (p.y - oldBounds.y) * scaleY,
      pressure: p.pressure,
    }));
  }

  if (
    initial.x1 !== undefined &&
    initial.y1 !== undefined &&
    initial.x2 !== undefined &&
    initial.y2 !== undefined
  ) {
    entry.x1 = newBounds.x + (initial.x1 - oldBounds.x) * scaleX;
    entry.y1 = newBounds.y + (initial.y1 - oldBounds.y) * scaleY;
    entry.x2 = newBounds.x + (initial.x2 - oldBounds.x) * scaleX;
    entry.y2 = newBounds.y + (initial.y2 - oldBounds.y) * scaleY;
  }

  if (initial.svgPathData && initial.width > 0 && initial.height > 0) {
    const pathScaleX = newWidth / initial.width;
    const pathScaleY = newHeight / initial.height;
    entry.svgPathData = transformPath(initial.svgPathData, {
      scaleX: pathScaleX,
      scaleY: pathScaleY,
    });
  }

  return entry;
}

export function handleToMovingEdges(handle: HandlePosition): ResizeSnapEdges {
  switch (handle) {
    case 'top-left':
      return { left: true, right: false, top: true, bottom: false };
    case 'top-center':
      return { left: false, right: false, top: true, bottom: false };
    case 'top-right':
      return { left: false, right: true, top: true, bottom: false };
    case 'middle-left':
      return { left: true, right: false, top: false, bottom: false };
    case 'middle-right':
      return { left: false, right: true, top: false, bottom: false };
    case 'bottom-left':
      return { left: true, right: false, top: false, bottom: true };
    case 'bottom-center':
      return { left: false, right: false, top: false, bottom: true };
    case 'bottom-right':
      return { left: false, right: true, top: false, bottom: true };
    default:
      return { left: false, right: false, top: false, bottom: false };
  }
}
