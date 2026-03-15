import type { Shape } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { hitTestPoint, hitTestFrameLabel } from '../hit-test';
import { getAllShapes, getShape, updateShape } from '../scene-graph';
import { SpatialIndex } from '../spatial-index';
import {
  getSelectionBounds,
  hitTestHandle,
  computeResize,
  computeRotation,
  getResizeCursor,
  type HandlePosition,
} from '../selection';
import { snapPosition, type SnapLine, type DistanceIndicator } from '../snap';

interface InitialShapeData {
  x: number;
  y: number;
  width: number;
  height: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: Array<{ x: number; y: number; pressure: number }>;
  shapeType: string;
}

type MoveState =
  | { type: 'idle' }
  | {
      type: 'dragging';
      startCanvas: { x: number; y: number };
      initialData: Map<string, InitialShapeData>;
    }
  | { type: 'marquee'; startCanvas: { x: number; y: number } }
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
    };

function captureShapeData(shape: Shape): InitialShapeData {
  const data: InitialShapeData = {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    shapeType: shape.type,
  };
  if (shape.type === 'line' || shape.type === 'arrow') {
    data.x1 = shape.x1;
    data.y1 = shape.y1;
    data.x2 = shape.x2;
    data.y2 = shape.y2;
  }
  if (shape.type === 'path') {
    data.points = shape.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure }));
  }
  return data;
}

function buildMoveUpdate(initial: InitialShapeData, dx: number, dy: number): Partial<Shape> {
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
}

function buildResizeEntry(
  initial: InitialShapeData,
  oldBounds: { x: number; y: number; width: number; height: number },
  newBounds: { x: number; y: number; width: number; height: number },
): ResizePreviewEntry {
  const scaleX = oldBounds.width > 0 ? newBounds.width / oldBounds.width : 1;
  const scaleY = oldBounds.height > 0 ? newBounds.height / oldBounds.height : 1;

  const relX = initial.x - oldBounds.x;
  const relY = initial.y - oldBounds.y;

  const entry: ResizePreviewEntry = {
    x: newBounds.x + relX * scaleX,
    y: newBounds.y + relY * scaleY,
    width: Math.max(1, initial.width * scaleX),
    height: Math.max(1, initial.height * scaleY),
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

  return entry;
}

export class MoveTool extends BaseTool {
  readonly name = 'move';
  readonly cursor = 'default';

  private state: MoveState = { type: 'idle' };
  private spatialIndex = new SpatialIndex();
  marqueeRect: { x: number; y: number; width: number; height: number } | null = null;
  dragOffset: { dx: number; dy: number } | null = null;
  resizePreview: Map<string, ResizePreviewEntry> | null = null;
  endpointPreview: { shapeId: string; x1: number; y1: number; x2: number; y2: number } | null =
    null;
  activeSnapLines: SnapLine[] = [];
  activeDistanceIndicators: DistanceIndicator[] = [];
  private dragInitialData: Map<string, InitialShapeData> | null = null;
  private dragShapesCache: Shape[] = [];

  onPointerDown(ctx: ToolContext): ToolResult | void {
    const shapes = getAllShapes(ctx.ydoc);
    this.spatialIndex.rebuild(shapes);
    const store = getToolStore();

    if (store.selectedIds.length > 0) {
      const selectedShapes = store.selectedIds
        .map((id) => shapes.find((s) => s.id === id))
        .filter(Boolean) as Shape[];

      if (selectedShapes.length > 0) {
        const bounds = getSelectionBounds(selectedShapes);
        if (bounds) {
          const handle = hitTestHandle(
            ctx.canvasPoint.x,
            ctx.canvasPoint.y,
            bounds,
            ctx.camera.zoom,
          );

          if (handle === 'rotation') {
            const center = {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
            };
            const initialRotations = new Map<string, number>();
            for (const shape of selectedShapes) {
              initialRotations.set(shape.id, shape.rotation);
            }
            this.state = { type: 'rotating', center, initialRotations };
            return { cursor: 'grab' };
          }

          if (handle === 'line-start' || handle === 'line-end') {
            const shape = selectedShapes[0]!;
            this.state = {
              type: 'dragging-endpoint',
              endpoint: handle,
              shapeId: shape.id,
              initialData: captureShapeData(shape),
              startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
            };
            return { cursor: 'move' };
          }

          if (handle) {
            const initialData = new Map<string, InitialShapeData>();
            for (const shape of selectedShapes) {
              initialData.set(shape.id, captureShapeData(shape));
            }
            this.state = {
              type: 'resizing',
              handle,
              startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
              initialData,
              selectionBounds: {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              },
            };
            return { cursor: getResizeCursor(handle) };
          }
        }
      }
    }

    const hit = hitTestPoint(
      ctx.canvasPoint.x,
      ctx.canvasPoint.y,
      shapes,
      this.spatialIndex,
      ctx.camera.zoom,
    );

    if (hit) {
      if (ctx.shiftKey) {
        store.toggleSelection(hit.id);
      } else if (!store.selectedIds.includes(hit.id)) {
        store.setSelectedIds([hit.id]);
      }

      const selectedIds = getToolStore().selectedIds;
      const initialData = new Map<string, InitialShapeData>();
      for (const id of selectedIds) {
        const shape = shapes.find((s) => s.id === id);
        if (shape) initialData.set(id, captureShapeData(shape));
      }

      this.dragInitialData = initialData;
      const selectedIdSet = new Set(getToolStore().selectedIds);
      this.dragShapesCache = shapes.filter(
        (s) => !selectedIdSet.has(s.id) && s.visible && !s.locked,
      );
      this.state = {
        type: 'dragging',
        startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
        initialData,
      };
      return { cursor: 'move' };
    }

    const selectedFrameHit = this.hitSelectedFrame(
      ctx.canvasPoint.x,
      ctx.canvasPoint.y,
      shapes,
      store.selectedIds,
    );

    if (selectedFrameHit) {
      const selectedIds = store.selectedIds;
      const initialData = new Map<string, InitialShapeData>();
      for (const id of selectedIds) {
        const shape = shapes.find((s) => s.id === id);
        if (shape) initialData.set(id, captureShapeData(shape));
      }
      this.dragInitialData = initialData;
      const selectedIdSet = new Set(selectedIds);
      this.dragShapesCache = shapes.filter(
        (s) => !selectedIdSet.has(s.id) && s.visible && !s.locked,
      );
      this.state = {
        type: 'dragging',
        startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
        initialData,
      };
      return { cursor: 'move' };
    }

    if (!ctx.shiftKey) {
      store.clearSelection();
    }

    this.state = {
      type: 'marquee',
      startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
    };
    this.marqueeRect = null;
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (this.state.type === 'dragging') {
      const rawDx = ctx.canvasPoint.x - this.state.startCanvas.x;
      const rawDy = ctx.canvasPoint.y - this.state.startCanvas.y;

      const initialEntries = Array.from(this.state.initialData.values());
      const firstInitial = initialEntries[0];
      if (!firstInitial) {
        this.dragOffset = { dx: rawDx, dy: rawDy };
        return { cursor: 'move' };
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

      const boundsX = minX + rawDx;
      const boundsY = minY + rawDy;
      const boundsW = maxX - minX;
      const boundsH = maxY - minY;

      const result = snapPosition(
        boundsX,
        boundsY,
        boundsW,
        boundsH,
        this.dragShapesCache,
        ctx.camera.zoom,
      );

      const dx = rawDx + (result.x - boundsX);
      const dy = rawDy + (result.y - boundsY);
      this.dragOffset = { dx, dy };
      this.activeSnapLines = result.snapLines;
      this.activeDistanceIndicators = result.distanceIndicators;
      return { cursor: 'move' };
    }

    if (this.state.type === 'resizing') {
      const delta = {
        x: ctx.canvasPoint.x - this.state.startCanvas.x,
        y: ctx.canvasPoint.y - this.state.startCanvas.y,
      };

      const newSelectionBounds = computeResize(
        this.state.handle,
        this.state.selectionBounds,
        delta,
        ctx.shiftKey,
        ctx.altKey,
      );

      const preview = new Map<string, ResizePreviewEntry>();
      for (const [id, initial] of this.state.initialData) {
        preview.set(id, buildResizeEntry(initial, this.state.selectionBounds, newSelectionBounds));
      }
      this.resizePreview = preview;
      return { cursor: getResizeCursor(this.state.handle) };
    }

    if (this.state.type === 'dragging-endpoint') {
      const dx = ctx.canvasPoint.x - this.state.startCanvas.x;
      const dy = ctx.canvasPoint.y - this.state.startCanvas.y;
      const initial = this.state.initialData;

      let newX1 = initial.x1!;
      let newY1 = initial.y1!;
      let newX2 = initial.x2!;
      let newY2 = initial.y2!;

      if (this.state.endpoint === 'line-start') {
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

      this.endpointPreview = {
        shapeId: this.state.shapeId,
        x1: newX1,
        y1: newY1,
        x2: newX2,
        y2: newY2,
      };
      return { cursor: 'move' };
    }

    if (this.state.type === 'rotating') {
      const angle = computeRotation(this.state.center, ctx.canvasPoint, ctx.shiftKey);
      for (const [id] of this.state.initialRotations) {
        updateShape(ctx.ydoc, id, { rotation: angle } as Partial<Shape>);
      }
      return { cursor: 'grab' };
    }

    if (this.state.type === 'marquee') {
      const sx = this.state.startCanvas.x;
      const sy = this.state.startCanvas.y;
      const ex = ctx.canvasPoint.x;
      const ey = ctx.canvasPoint.y;

      this.marqueeRect = {
        x: Math.min(sx, ex),
        y: Math.min(sy, ey),
        width: Math.abs(ex - sx),
        height: Math.abs(ey - sy),
      };
      return;
    }

    const shapes = getAllShapes(ctx.ydoc);
    this.spatialIndex.rebuild(shapes);

    const store = getToolStore();
    if (store.selectedIds.length > 0) {
      const selectedShapes = store.selectedIds
        .map((id) => shapes.find((s) => s.id === id))
        .filter(Boolean) as Shape[];
      const bounds = getSelectionBounds(selectedShapes);
      if (bounds) {
        const handle = hitTestHandle(ctx.canvasPoint.x, ctx.canvasPoint.y, bounds, ctx.camera.zoom);
        if (handle) {
          return { cursor: getResizeCursor(handle) };
        }
      }
    }

    const hit = hitTestPoint(
      ctx.canvasPoint.x,
      ctx.canvasPoint.y,
      shapes,
      this.spatialIndex,
      ctx.camera.zoom,
    );
    store.setHoveredId(hit?.id ?? null);
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (this.state.type === 'dragging' && this.dragOffset) {
      const { dx, dy } = this.dragOffset;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        for (const [id, initial] of this.state.initialData) {
          updateShape(ctx.ydoc, id, buildMoveUpdate(initial, dx, dy));
        }
      }
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'resizing' && this.resizePreview) {
      for (const [id, bounds] of this.resizePreview) {
        updateShape(ctx.ydoc, id, bounds as Partial<Shape>);
      }
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'dragging-endpoint' && this.endpointPreview) {
      const ep = this.endpointPreview;
      const minX = Math.min(ep.x1, ep.x2);
      const minY = Math.min(ep.y1, ep.y2);
      const width = Math.max(1, Math.abs(ep.x2 - ep.x1));
      const height = Math.max(1, Math.abs(ep.y2 - ep.y1));
      updateShape(ctx.ydoc, ep.shapeId, {
        x: minX,
        y: minY,
        width,
        height,
        x1: ep.x1,
        y1: ep.y1,
        x2: ep.x2,
        y2: ep.y2,
      } as Partial<Shape>);
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'rotating') {
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'marquee' && this.marqueeRect) {
      const shapes = getAllShapes(ctx.ydoc);
      this.spatialIndex.rebuild(shapes);

      const { x, y, width, height } = this.marqueeRect;
      const hits = this.spatialIndex.queryRect(x, y, x + width, y + height);
      const hitIds = hits.map((h) => h.id);

      const validIds = shapes
        .filter((s) => hitIds.includes(s.id) && !s.locked && s.visible)
        .filter(
          (s) => s.x >= x && s.y >= y && s.x + s.width <= x + width && s.y + s.height <= y + height,
        )
        .map((s) => s.id);

      const store = getToolStore();
      if (ctx.shiftKey) {
        const combined = new Set([...store.selectedIds, ...validIds]);
        store.setSelectedIds(Array.from(combined));
      } else {
        store.setSelectedIds(validIds);
      }
    }

    this.resetState();
    return { cursor: 'default' };
  }

  onDeactivate(): void {
    this.resetState();
  }

  private hitSelectedFrame(
    px: number,
    py: number,
    shapes: Shape[],
    selectedIds: string[],
  ): Shape | null {
    for (const id of selectedIds) {
      const shape = shapes.find((s) => s.id === id);
      if (!shape || shape.type !== 'frame') continue;
      if (
        px >= shape.x &&
        px <= shape.x + shape.width &&
        py >= shape.y &&
        py <= shape.y + shape.height
      ) {
        return shape;
      }
    }
    return null;
  }

  private resetState() {
    this.state = { type: 'idle' };
    this.marqueeRect = null;
    this.dragOffset = null;
    this.resizePreview = null;
    this.endpointPreview = null;
    this.dragInitialData = null;
    this.dragShapesCache = [];
    this.activeSnapLines = [];
    this.activeDistanceIndicators = [];
  }

  getDragPositions(): Map<string, { x: number; y: number }> | null {
    if (this.state.type !== 'dragging' || !this.dragOffset || !this.dragInitialData) return null;
    const result = new Map<string, { x: number; y: number }>();
    for (const [id, initial] of this.dragInitialData) {
      result.set(id, {
        x: initial.x + this.dragOffset.dx,
        y: initial.y + this.dragOffset.dy,
      });
    }
    return result;
  }

  getDragEndpointOffsets(): { dx: number; dy: number } | null {
    return this.dragOffset;
  }

  getResizePreview(): Map<string, ResizePreviewEntry> | null {
    return this.resizePreview;
  }

  getEndpointPreview(): { shapeId: string; x1: number; y1: number; x2: number; y2: number } | null {
    return this.endpointPreview;
  }

  getSnapLines(): SnapLine[] {
    return this.activeSnapLines;
  }

  getDistanceIndicators(): DistanceIndicator[] {
    return this.activeDistanceIndicators;
  }
}
