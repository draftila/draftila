import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getToolStore, type ToolContext, type ToolResult } from './base-tool';
import {
  type InitialShapeData,
  type ResizePreviewEntry,
  type ConstraintShapeData,
  type MoveState,
  buildMoveUpdate,
  buildResizeEntry,
  captureShapeData,
  handleToMovingEdges,
} from './move-tool-utils';
import { applyConstraints, DEFAULT_CONSTRAINTS, type Constraints } from '../constraints';
import {
  getAllShapes,
  getShape,
  updateShape,
  applyAutoLayoutForAncestors,
  reorderAutoLayoutChildren,
  computeAutoLayoutPreview,
  computeAutoLayoutResizePreview,
} from '../scene-graph';
import { isAutoLayoutFrame } from '../auto-layout';
import { computeResize, computeRotation, getResizeCursor, type HandlePosition } from '../selection';
import {
  snapPosition,
  snapResize,
  type SnapLine,
  type DistanceIndicator,
  type ParentFrameRect,
  type GuideSnapTarget,
} from '../snap';
import { updateGuidePosition } from '../guides';

export interface DragMoveResult {
  dragOffset: { dx: number; dy: number };
  activeSnapLines: SnapLine[];
  activeDistanceIndicators: DistanceIndicator[];
  autoLayoutPreview: Map<string, { x: number; y: number }> | null;
  cursor: string;
}

export function handleDragMove(
  state: Extract<MoveState, { type: 'dragging' }>,
  ctx: ToolContext,
  dragShapesCache: Shape[],
  parentFrameCache: ParentFrameRect | undefined,
  guides: GuideSnapTarget[],
): DragMoveResult {
  const rawDx = ctx.canvasPoint.x - state.startCanvas.x;
  const rawDy = ctx.canvasPoint.y - state.startCanvas.y;

  const initialEntries = Array.from(state.initialData.values());
  const firstInitial = initialEntries[0];
  if (!firstInitial) {
    return {
      dragOffset: { dx: rawDx, dy: rawDy },
      activeSnapLines: [],
      activeDistanceIndicators: [],
      autoLayoutPreview: null,
      cursor: 'move',
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const init of initialEntries) {
    minX = Math.min(minX, init.x);
    minY = Math.min(minY, init.y);
    maxX = Math.max(maxX, init.x + init.width);
    maxY = Math.max(maxY, init.y + init.height);
  }

  const movedIds = Array.from(state.initialData.keys());

  const firstId = movedIds[0];
  const firstShape = firstId ? getShape(ctx.ydoc, firstId) : null;
  const parentId = firstShape?.parentId ?? null;
  const parent = parentId ? getShape(ctx.ydoc, parentId) : null;
  const inAutoLayout = !!parent && isAutoLayoutFrame(parent);

  let dragOffset: { dx: number; dy: number };
  let activeSnapLines: SnapLine[] = [];
  let activeDistanceIndicators: DistanceIndicator[] = [];

  if (inAutoLayout) {
    dragOffset = { dx: Math.round(rawDx + minX) - minX, dy: Math.round(rawDy + minY) - minY };
  } else {
    const boundsX = minX + rawDx;
    const boundsY = minY + rawDy;
    const boundsW = maxX - minX;
    const boundsH = maxY - minY;

    const result = snapPosition(
      boundsX,
      boundsY,
      boundsW,
      boundsH,
      dragShapesCache,
      ctx.camera.zoom,
      parentFrameCache,
      guides,
    );

    const snappedX = Math.round(result.x);
    const snappedY = Math.round(result.y);
    dragOffset = { dx: snappedX - minX, dy: snappedY - minY };
    activeSnapLines = result.snapLines;
    activeDistanceIndicators = result.distanceIndicators;
  }

  const autoLayoutPreview = inAutoLayout
    ? computeAutoLayoutPreview(ctx.ydoc, movedIds, dragOffset)
    : null;

  return {
    dragOffset,
    activeSnapLines,
    activeDistanceIndicators,
    autoLayoutPreview,
    cursor: 'move',
  };
}

export interface ResizeMoveResult {
  resizePreview: Map<string, ResizePreviewEntry>;
  activeSnapLines: SnapLine[];
  activeDistanceIndicators: DistanceIndicator[];
  autoLayoutPreview: Map<string, { x: number; y: number }> | null;
  cursor: string;
}

export function handleResizeMove(
  state: Extract<MoveState, { type: 'resizing' }>,
  ctx: ToolContext,
  dragShapesCache: Shape[],
  parentFrameCache: ParentFrameRect | undefined,
  guides: GuideSnapTarget[],
): ResizeMoveResult {
  const delta = {
    x: ctx.canvasPoint.x - state.startCanvas.x,
    y: ctx.canvasPoint.y - state.startCanvas.y,
  };

  let newSelectionBounds = computeResize(
    state.handle,
    state.selectionBounds,
    delta,
    ctx.shiftKey,
    ctx.altKey,
  );

  const resizingIds = Array.from(state.initialData.keys());
  const firstId = resizingIds[0];
  const firstShape = firstId ? getShape(ctx.ydoc, firstId) : null;
  const parentId = firstShape?.parentId ?? null;
  const parent = parentId ? getShape(ctx.ydoc, parentId) : null;
  const inAutoLayout = !!parent && isAutoLayoutFrame(parent);

  let activeSnapLines: SnapLine[] = [];

  if (inAutoLayout) {
    newSelectionBounds = {
      x: Math.round(newSelectionBounds.x),
      y: Math.round(newSelectionBounds.y),
      width: Math.round(newSelectionBounds.width),
      height: Math.round(newSelectionBounds.height),
    };
  } else {
    const moving = handleToMovingEdges(state.handle);
    const resizeSnap = snapResize(
      newSelectionBounds,
      moving,
      dragShapesCache,
      ctx.camera.zoom,
      parentFrameCache,
      guides,
    );
    newSelectionBounds = {
      x: Math.round(resizeSnap.bounds.x),
      y: Math.round(resizeSnap.bounds.y),
      width: Math.round(resizeSnap.bounds.width),
      height: Math.round(resizeSnap.bounds.height),
    };
    activeSnapLines = resizeSnap.snapLines;
  }

  const preview = new Map<string, ResizePreviewEntry>();
  for (const [id, initial] of state.initialData) {
    preview.set(id, buildResizeEntry(initial, state.selectionBounds, newSelectionBounds));
  }

  const allShapes = getAllShapes(ctx.ydoc);
  const shapeById = new Map(allShapes.map((shape) => [shape.id, shape]));

  if (!ctx.metaKey) {
    for (const [id, frameInitial] of state.initialData) {
      const frameShape = shapeById.get(id) as (Shape & ConstraintShapeData) | undefined;
      if (!frameShape || frameShape.type !== 'frame') continue;
      if ((frameShape.layoutMode ?? 'none') !== 'none') continue;

      const framePreview = preview.get(id);
      if (!framePreview) continue;

      const parentOld = { width: frameInitial.width, height: frameInitial.height };
      const parentNew = { width: framePreview.width, height: framePreview.height };

      for (const child of allShapes) {
        if (child.parentId !== id) continue;
        if (preview.has(child.id)) continue;

        const childInitial = captureShapeData(child);
        const childShape = child as Shape & ConstraintShapeData;
        const constraints: Constraints = {
          horizontal: childShape.constraintHorizontal ?? DEFAULT_CONSTRAINTS.horizontal,
          vertical: childShape.constraintVertical ?? DEFAULT_CONSTRAINTS.vertical,
        };

        const relChild = {
          x: childInitial.x - frameInitial.x,
          y: childInitial.y - frameInitial.y,
          width: childInitial.width,
          height: childInitial.height,
        };
        const originalRelChild = { ...relChild };

        const constrained = applyConstraints(
          relChild,
          constraints,
          parentOld,
          parentNew,
          originalRelChild,
        );

        const childOldBounds = {
          x: childInitial.x,
          y: childInitial.y,
          width: childInitial.width,
          height: childInitial.height,
        };
        const childNewBounds = {
          x: framePreview.x + constrained.x,
          y: framePreview.y + constrained.y,
          width: constrained.width,
          height: constrained.height,
        };

        preview.set(child.id, buildResizeEntry(childInitial, childOldBounds, childNewBounds));
      }
    }
  }

  let autoLayoutPreview: Map<string, { x: number; y: number }> | null = null;
  if (inAutoLayout) {
    const overrides = new Map<string, { width: number; height: number }>();
    for (const [id, entry] of preview) {
      overrides.set(id, { width: entry.width, height: entry.height });
    }
    autoLayoutPreview = computeAutoLayoutResizePreview(ctx.ydoc, overrides);
  }

  return {
    resizePreview: preview,
    activeSnapLines,
    activeDistanceIndicators: [],
    autoLayoutPreview,
    cursor: getResizeCursor(state.handle),
  };
}

export interface EndpointMoveResult {
  endpointPreview: { shapeId: string; x1: number; y1: number; x2: number; y2: number };
  cursor: string;
}

export function handleEndpointMove(
  state: Extract<MoveState, { type: 'dragging-endpoint' }>,
  ctx: ToolContext,
): EndpointMoveResult {
  const dx = ctx.canvasPoint.x - state.startCanvas.x;
  const dy = ctx.canvasPoint.y - state.startCanvas.y;
  const initial = state.initialData;

  let newX1 = initial.x1!;
  let newY1 = initial.y1!;
  let newX2 = initial.x2!;
  let newY2 = initial.y2!;

  if (state.endpoint === 'line-start') {
    newX1 += dx;
    newY1 += dy;
    if (ctx.shiftKey) {
      const adx = newX1 - newX2;
      const ady = newY1 - newY2;
      const angle = Math.atan2(ady, adx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.sqrt(adx * adx + ady * ady);
      newX1 = newX2 + Math.cos(snapped) * length;
      newY1 = newY2 + Math.sin(snapped) * length;
    }
  } else {
    newX2 += dx;
    newY2 += dy;
    if (ctx.shiftKey) {
      const adx = newX2 - newX1;
      const ady = newY2 - newY1;
      const angle = Math.atan2(ady, adx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.sqrt(adx * adx + ady * ady);
      newX2 = newX1 + Math.cos(snapped) * length;
      newY2 = newY1 + Math.sin(snapped) * length;
    }
  }

  return {
    endpointPreview: {
      shapeId: state.shapeId,
      x1: newX1,
      y1: newY1,
      x2: newX2,
      y2: newY2,
    },
    cursor: 'move',
  };
}

export interface RotateMoveResult {
  rotationPreview: Map<string, number>;
  cursor: string;
}

export function handleRotateMove(
  state: Extract<MoveState, { type: 'rotating' }>,
  ctx: ToolContext,
): RotateMoveResult {
  const angle = computeRotation(state.center, ctx.canvasPoint, ctx.shiftKey);
  const preview = new Map<string, number>();
  for (const [id] of state.initialRotations) {
    preview.set(id, angle);
  }
  return { rotationPreview: preview, cursor: 'grab' };
}

export interface GuideMoveResult {
  cursor: string;
}

export function handleGuideMove(
  state: Extract<MoveState, { type: 'dragging-guide' }>,
  ctx: ToolContext,
): GuideMoveResult {
  const store = getToolStore();
  const pageId = store.getActivePageId();
  if (pageId) {
    const rawPos = state.axis === 'x' ? ctx.canvasPoint.x : ctx.canvasPoint.y;
    const shapes = getAllShapes(ctx.ydoc).filter((s) => s.visible && !s.locked);
    const threshold = 5 / ctx.camera.zoom;
    let snappedPos = rawPos;
    let bestDist = threshold;
    for (const shape of shapes) {
      const edges =
        state.axis === 'x'
          ? [shape.x, shape.x + shape.width / 2, shape.x + shape.width]
          : [shape.y, shape.y + shape.height / 2, shape.y + shape.height];
      for (const edge of edges) {
        const d = Math.abs(rawPos - edge);
        if (d < bestDist) {
          bestDist = d;
          snappedPos = edge;
        }
      }
    }
    updateGuidePosition(ctx.ydoc, pageId, state.guideId, Math.round(snappedPos));
  }
  return { cursor: state.axis === 'x' ? 'col-resize' : 'row-resize' };
}

export interface MarqueeMoveResult {
  marqueeRect: { x: number; y: number; width: number; height: number };
}

export function handleMarqueeMove(
  state: Extract<MoveState, { type: 'marquee' }>,
  ctx: ToolContext,
): MarqueeMoveResult {
  const sx = state.startCanvas.x;
  const sy = state.startCanvas.y;
  const ex = ctx.canvasPoint.x;
  const ey = ctx.canvasPoint.y;

  return {
    marqueeRect: {
      x: Math.min(sx, ex),
      y: Math.min(sy, ey),
      width: Math.abs(ex - sx),
      height: Math.abs(ey - sy),
    },
  };
}

const DRAG_THRESHOLD = 3;

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.abs(dx) >= DRAG_THRESHOLD || Math.abs(dy) >= DRAG_THRESHOLD;
}

export function commitDrag(
  ydoc: Y.Doc,
  initialData: Map<string, InitialShapeData>,
  dragOffset: { dx: number; dy: number },
): void {
  const { dx, dy } = dragOffset;
  if (exceedsDragThreshold(dx, dy)) {
    const movedIds = Array.from(initialData.keys());
    reorderAutoLayoutChildren(ydoc, movedIds, dragOffset);
    for (const [id, initial] of initialData) {
      updateShape(ydoc, id, buildMoveUpdate(initial, dx, dy));
    }
    for (const [id] of initialData) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
  }
}

export function commitResize(ydoc: Y.Doc, resizePreview: Map<string, ResizePreviewEntry>): void {
  for (const [id, bounds] of resizePreview) {
    updateShape(ydoc, id, bounds as Partial<Shape>);
  }
  for (const [id] of resizePreview) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
}

export function commitEndpoint(
  ydoc: Y.Doc,
  endpointPreview: { shapeId: string; x1: number; y1: number; x2: number; y2: number },
): void {
  const ep = endpointPreview;
  const minX = Math.min(ep.x1, ep.x2);
  const minY = Math.min(ep.y1, ep.y2);
  const width = Math.max(1, Math.abs(ep.x2 - ep.x1));
  const height = Math.max(1, Math.abs(ep.y2 - ep.y1));
  updateShape(ydoc, ep.shapeId, {
    x: minX,
    y: minY,
    width,
    height,
    x1: ep.x1,
    y1: ep.y1,
    x2: ep.x2,
    y2: ep.y2,
  } as Partial<Shape>);
  applyAutoLayoutForAncestors(ydoc, ep.shapeId);
}

export function commitRotation(ydoc: Y.Doc, rotationPreview: Map<string, number>): void {
  for (const [id, angle] of rotationPreview) {
    updateShape(ydoc, id, { rotation: angle } as Partial<Shape>);
  }
  for (const [id] of rotationPreview) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
}
