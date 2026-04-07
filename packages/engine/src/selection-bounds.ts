import type { Shape, Point } from '@draftila/shared';

export type HandlePosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'rotation'
  | 'line-start'
  | 'line-end';

export interface SelectionHandle {
  position: HandlePosition;
  x: number;
  y: number;
}

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  handles: SelectionHandle[];
}

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;

export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function buildHandles(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): SelectionHandle[] {
  const localHandles: Array<{ position: HandlePosition; lx: number; ly: number }> = [
    { position: 'top-left', lx: x, ly: y },
    { position: 'top-center', lx: x + width / 2, ly: y },
    { position: 'top-right', lx: x + width, ly: y },
    { position: 'middle-left', lx: x, ly: y + height / 2 },
    { position: 'middle-right', lx: x + width, ly: y + height / 2 },
    { position: 'bottom-left', lx: x, ly: y + height },
    { position: 'bottom-center', lx: x + width / 2, ly: y + height },
    { position: 'bottom-right', lx: x + width, ly: y + height },
    { position: 'rotation', lx: x + width / 2, ly: y - ROTATION_HANDLE_OFFSET },
  ];

  if (rotation === 0) {
    return localHandles.map((h) => ({ position: h.position, x: h.lx, y: h.ly }));
  }

  const cx = x + width / 2;
  const cy = y + height / 2;

  return localHandles.map((h) => {
    const rotated = rotatePoint(h.lx, h.ly, cx, cy, rotation);
    return { position: h.position, x: rotated.x, y: rotated.y };
  });
}

export function isEndpointShape(shape: Shape): boolean {
  return shape.type === 'line';
}

export function getSelectionBounds(shapes: Shape[]): SelectionBounds | null {
  if (shapes.length === 0) return null;

  if (shapes.length === 1) {
    const shape = shapes[0]!;

    if (isEndpointShape(shape)) {
      const s = shape as Shape & { x1: number; y1: number; x2: number; y2: number };
      return {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rotation: 0,
        handles: [
          { position: 'line-start', x: s.x1, y: s.y1 },
          { position: 'line-end', x: s.x2, y: s.y2 },
        ],
      };
    }

    const handles = buildHandles(shape.x, shape.y, shape.width, shape.height, shape.rotation);
    return {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rotation: shape.rotation,
      handles,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  const x = minX;
  const y = minY;
  const width = maxX - minX;
  const height = maxY - minY;

  const handles = buildHandles(x, y, width, height, 0);
  return { x, y, width, height, rotation: 0, handles };
}

export function hitTestHandle(
  px: number,
  py: number,
  bounds: SelectionBounds,
  zoom: number,
): HandlePosition | null {
  const size = HANDLE_SIZE / zoom;
  const half = size / 2;

  for (const handle of bounds.handles) {
    if (handle.position === 'line-start' || handle.position === 'line-end') {
      const dx = px - handle.x;
      const dy = py - handle.y;
      if (dx * dx + dy * dy <= half * half) {
        return handle.position;
      }
    } else if (
      px >= handle.x - half &&
      px <= handle.x + half &&
      py >= handle.y - half &&
      py <= handle.y + half
    ) {
      return handle.position;
    }
  }

  return null;
}

export function getResizeCursor(position: HandlePosition): string {
  switch (position) {
    case 'top-left':
    case 'bottom-right':
      return 'nwse-resize';
    case 'top-right':
    case 'bottom-left':
      return 'nesw-resize';
    case 'top-center':
    case 'bottom-center':
      return 'ns-resize';
    case 'middle-left':
    case 'middle-right':
      return 'ew-resize';
    case 'rotation':
      return 'grab';
    case 'line-start':
    case 'line-end':
      return 'move';
    default:
      return 'default';
  }
}

export function normalizeRect(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

export function getAnchorAndDrag(
  handle: HandlePosition,
  bounds: { x: number; y: number; width: number; height: number },
): { anchorX: number; anchorY: number; dragX: number; dragY: number } {
  const { x, y, width: w, height: h } = bounds;

  switch (handle) {
    case 'top-left':
      return { anchorX: x + w, anchorY: y + h, dragX: x, dragY: y };
    case 'top-center':
      return { anchorX: x, anchorY: y + h, dragX: x, dragY: y };
    case 'top-right':
      return { anchorX: x, anchorY: y + h, dragX: x + w, dragY: y };
    case 'middle-left':
      return { anchorX: x + w, anchorY: y, dragX: x, dragY: y };
    case 'middle-right':
      return { anchorX: x, anchorY: y, dragX: x + w, dragY: y };
    case 'bottom-left':
      return { anchorX: x + w, anchorY: y, dragX: x, dragY: y + h };
    case 'bottom-center':
      return { anchorX: x, anchorY: y, dragX: x, dragY: y + h };
    case 'bottom-right':
      return { anchorX: x, anchorY: y, dragX: x + w, dragY: y + h };
    default:
      return { anchorX: x, anchorY: y, dragX: x + w, dragY: y + h };
  }
}

export function computeResize(
  handle: HandlePosition,
  startBounds: { x: number; y: number; width: number; height: number },
  delta: Point,
  shiftKey: boolean,
  altKey: boolean,
): { x: number; y: number; width: number; height: number } {
  const { anchorX, anchorY, dragX, dragY } = getAnchorAndDrag(handle, startBounds);

  const newDragX = dragX + delta.x;
  const newDragY = dragY + delta.y;

  const isVerticalOnly = handle === 'top-center' || handle === 'bottom-center';
  const isHorizontalOnly = handle === 'middle-left' || handle === 'middle-right';

  let rawWidth = isVerticalOnly ? startBounds.width : newDragX - anchorX;
  let rawHeight = isHorizontalOnly ? startBounds.height : newDragY - anchorY;

  if (shiftKey && startBounds.width > 0 && startBounds.height > 0) {
    const aspect = startBounds.width / startBounds.height;
    if (!isVerticalOnly && !isHorizontalOnly) {
      const absW = Math.abs(rawWidth);
      const absH = Math.abs(rawHeight);
      const signW = rawWidth >= 0 ? 1 : -1;
      const signH = rawHeight >= 0 ? 1 : -1;
      if (absW / aspect > absH) {
        rawHeight = (absW / aspect) * signH;
      } else {
        rawWidth = absH * aspect * signW;
      }
    } else if (isVerticalOnly) {
      rawWidth = Math.abs(rawHeight) * aspect * (rawHeight >= 0 ? 1 : -1);
    } else {
      rawHeight = (Math.abs(rawWidth) / aspect) * (rawWidth >= 0 ? 1 : -1);
    }
  }

  let originX = isVerticalOnly ? startBounds.x : anchorX;
  let originY = isHorizontalOnly ? startBounds.y : anchorY;

  if (altKey) {
    const cx = startBounds.x + startBounds.width / 2;
    const cy = startBounds.y + startBounds.height / 2;
    originX = cx - rawWidth / 2;
    originY = cy - rawHeight / 2;
    return normalizeRect(originX, originY, rawWidth, rawHeight);
  }

  return normalizeRect(originX, originY, rawWidth, rawHeight);
}

export function computeRotation(center: Point, current: Point, shiftKey: boolean): number {
  const angle = Math.atan2(current.y - center.y, current.x - center.x) * (180 / Math.PI) + 90;
  const normalized = ((angle % 360) + 360) % 360;

  if (shiftKey) {
    return Math.round(normalized / 15) * 15;
  }

  return Math.round(normalized * 10) / 10;
}

export const HANDLE_SIZE_PX = HANDLE_SIZE;
