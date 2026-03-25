import type { Shape } from '@draftila/shared';
import type { ResizePreviewEntry } from '@draftila/engine/tools/move-tool';
import { getAnimatedPosition } from './layout-animation';

export function applyDragToShape(
  s: Shape,
  dragPositions: ReadonlyMap<string, { x: number; y: number }>,
  dragEndpointOffset: { dx: number; dy: number } | null,
): Shape {
  const dragPos = dragPositions.get(s.id);
  if (!dragPos || !dragEndpointOffset) return s;
  const updated = { ...s, x: dragPos.x, y: dragPos.y } as Shape;
  if (s.type === 'line' && dragEndpointOffset) {
    const orig = s as Shape & { x1: number; y1: number; x2: number; y2: number };
    return {
      ...updated,
      x1: orig.x1 + dragEndpointOffset.dx,
      y1: orig.y1 + dragEndpointOffset.dy,
      x2: orig.x2 + dragEndpointOffset.dx,
      y2: orig.y2 + dragEndpointOffset.dy,
    } as Shape;
  }
  if (s.type === 'path' && dragEndpointOffset) {
    const orig = s as Shape & { points: Array<{ x: number; y: number; pressure: number }> };
    return {
      ...updated,
      points: orig.points.map((p) => ({
        x: p.x + dragEndpointOffset.dx,
        y: p.y + dragEndpointOffset.dy,
        pressure: p.pressure,
      })),
    } as Shape;
  }
  return updated;
}

export function applyResizeToShape(s: Shape, entry: ResizePreviewEntry): Shape {
  return { ...s, ...entry } as unknown as Shape;
}

export function applyRotationToShape(
  s: Shape,
  rotationPreview: ReadonlyMap<string, number>,
): Shape {
  const angle = rotationPreview.get(s.id);
  if (angle === undefined) return s;
  return { ...s, rotation: angle } as Shape;
}

export function applyEndpointPreviewToShape(
  s: Shape,
  endpointPreview: { shapeId: string; x1: number; y1: number; x2: number; y2: number },
): Shape {
  if (endpointPreview.shapeId !== s.id) return s;
  const ep = endpointPreview;
  return {
    ...s,
    x: Math.min(ep.x1, ep.x2),
    y: Math.min(ep.y1, ep.y2),
    width: Math.max(1, Math.abs(ep.x2 - ep.x1)),
    height: Math.max(1, Math.abs(ep.y2 - ep.y1)),
    x1: ep.x1,
    y1: ep.y1,
    x2: ep.x2,
    y2: ep.y2,
    svgPathData: undefined,
  } as Shape;
}

export interface TransformContext {
  dragPositions: ReadonlyMap<string, { x: number; y: number }> | null;
  dragEndpointOffset: { dx: number; dy: number } | null;
  resizePreview: ReadonlyMap<string, ResizePreviewEntry> | null;
  rotationPreview: ReadonlyMap<string, number> | null;
  endpointPreview: { shapeId: string; x1: number; y1: number; x2: number; y2: number } | null;
}

export function applyTransforms(shape: Shape, tc: TransformContext): Shape {
  if (tc.endpointPreview?.shapeId === shape.id) {
    return applyEndpointPreviewToShape(shape, tc.endpointPreview);
  }
  if (tc.resizePreview?.get(shape.id)) {
    return applyResizeToShape(shape, tc.resizePreview.get(shape.id)!);
  }
  if (tc.dragPositions?.has(shape.id) && tc.dragEndpointOffset) {
    return applyDragToShape(shape, tc.dragPositions, tc.dragEndpointOffset);
  }
  if (tc.rotationPreview?.has(shape.id)) {
    return applyRotationToShape(shape, tc.rotationPreview);
  }
  const animPos = getAnimatedPosition(shape.id);
  if (animPos) {
    return { ...shape, x: animPos.x, y: animPos.y } as Shape;
  }
  return shape;
}
