import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { hitTestPoint } from '../hit-test';
import { hitTestGuide } from '../guides';
import { getAllShapes, getExpandedShapeIds, resolveGroupTarget } from '../scene-graph';
import { SpatialIndex } from '../spatial-index';
import { getSelectionBounds, hitTestHandle, getResizeCursor } from '../selection';
import { type SnapLine, type DistanceIndicator, type ParentFrameRect } from '../snap';
import { duplicateShapesInPlace } from '../clipboard';
import { type MoveState, type InitialShapeData, captureShapeData } from './move-tool-utils';
import {
  handleDragMove,
  handleResizeMove,
  handleEndpointMove,
  handleRotateMove,
  handleGuideMove,
  handleMarqueeMove,
  commitDrag,
  commitResize,
  commitEndpoint,
  commitRotation,
} from './move-tool-handlers';

export type { ResizePreviewEntry } from './move-tool-utils';
export type { ResizeMoveResult } from './move-tool-handlers';

export class MoveTool extends BaseTool {
  readonly name = 'move';
  readonly cursor = 'default';

  private state: MoveState = { type: 'idle' };
  private spatialIndex = new SpatialIndex();
  marqueeRect: { x: number; y: number; width: number; height: number } | null = null;
  dragOffset: { dx: number; dy: number } | null = null;
  resizePreview: Map<string, import('./move-tool-utils').ResizePreviewEntry> | null = null;
  rotationPreview: Map<string, number> | null = null;
  endpointPreview: { shapeId: string; x1: number; y1: number; x2: number; y2: number } | null =
    null;
  activeSnapLines: SnapLine[] = [];
  activeDistanceIndicators: DistanceIndicator[] = [];
  private dragInitialData: Map<string, InitialShapeData> | null = null;
  private dragShapesCache: Shape[] = [];
  private parentFrameCache: ParentFrameRect | undefined = undefined;

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
            const selectedIdSet = new Set(store.selectedIds);
            this.dragShapesCache = shapes.filter(
              (s) => !selectedIdSet.has(s.id) && s.visible && !s.locked,
            );
            this.parentFrameCache = this.resolveParentFrame(shapes, store.selectedIds);
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
      const targetId = resolveGroupTarget(ctx.ydoc, hit.id, store.enteredGroupId);

      if (ctx.shiftKey) {
        store.toggleSelection(targetId);
      } else if (!store.selectedIds.includes(targetId)) {
        store.setSelectedIds([targetId]);
      }

      let selectedIds = getToolStore().selectedIds;

      if (ctx.altKey && selectedIds.length > 0) {
        const oldToNew = duplicateShapesInPlace(ctx.ydoc, selectedIds);
        if (oldToNew.size > 0) {
          const newTopLevelIds = selectedIds
            .map((id) => oldToNew.get(id))
            .filter((id): id is string => id !== undefined);
          if (newTopLevelIds.length > 0) {
            store.setSelectedIds(newTopLevelIds);
            selectedIds = newTopLevelIds;
          }
        }
      }

      const refreshedShapes = getAllShapes(ctx.ydoc);
      const movableIds = getExpandedShapeIds(ctx.ydoc, selectedIds);
      const initialData = new Map<string, InitialShapeData>();
      for (const id of movableIds) {
        const shape = refreshedShapes.find((s) => s.id === id);
        if (shape) initialData.set(id, captureShapeData(shape));
      }

      this.dragInitialData = initialData;
      const selectedIdSet = new Set(movableIds);
      this.dragShapesCache = refreshedShapes.filter(
        (s) => !selectedIdSet.has(s.id) && s.visible && !s.locked,
      );
      this.parentFrameCache = this.resolveParentFrame(refreshedShapes, selectedIds);
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
      const movableIds = getExpandedShapeIds(ctx.ydoc, selectedIds);
      const initialData = new Map<string, InitialShapeData>();
      for (const id of movableIds) {
        const shape = shapes.find((s) => s.id === id);
        if (shape) initialData.set(id, captureShapeData(shape));
      }
      this.dragInitialData = initialData;
      const selectedIdSet = new Set(movableIds);
      this.dragShapesCache = shapes.filter(
        (s) => !selectedIdSet.has(s.id) && s.visible && !s.locked,
      );
      this.parentFrameCache = this.resolveParentFrame(shapes, selectedIds);
      this.state = {
        type: 'dragging',
        startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
        initialData,
      };
      return { cursor: 'move' };
    }

    const canvasGuides = store.getCanvasGuides();
    const hitGuideId = hitTestGuide(ctx.canvasPoint, canvasGuides, ctx.camera.zoom);
    if (hitGuideId) {
      store.clearSelection();
      store.setSelectedGuideId(hitGuideId);
      const hitGuide = canvasGuides.find((g) => g.id === hitGuideId);
      if (hitGuide) {
        this.state = {
          type: 'dragging-guide',
          guideId: hitGuideId,
          axis: hitGuide.axis,
          startPosition: hitGuide.position,
        };
      }
      return;
    }

    store.setSelectedGuideId(null);
    const preMarqueeIds = ctx.shiftKey ? [...store.selectedIds] : [];
    if (!ctx.shiftKey) {
      store.clearSelection();
      store.setEnteredGroupId(null);
    }

    this.state = {
      type: 'marquee',
      startCanvas: { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y },
      preMarqueeIds,
    };
    this.marqueeRect = null;
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (this.state.type === 'dragging') {
      const result = handleDragMove(
        this.state,
        ctx,
        this.dragShapesCache,
        this.parentFrameCache,
        getToolStore().getGuides(),
      );
      this.dragOffset = result.dragOffset;
      this.activeSnapLines = result.activeSnapLines;
      this.activeDistanceIndicators = result.activeDistanceIndicators;
      return { cursor: result.cursor };
    }

    if (this.state.type === 'resizing') {
      const result = handleResizeMove(
        this.state,
        ctx,
        this.dragShapesCache,
        this.parentFrameCache,
        getToolStore().getGuides(),
      );
      this.resizePreview = result.resizePreview;
      this.activeSnapLines = result.activeSnapLines;
      this.activeDistanceIndicators = result.activeDistanceIndicators;
      return { cursor: result.cursor };
    }

    if (this.state.type === 'dragging-endpoint') {
      const result = handleEndpointMove(this.state, ctx);
      this.endpointPreview = result.endpointPreview;
      return { cursor: result.cursor };
    }

    if (this.state.type === 'rotating') {
      const result = handleRotateMove(this.state, ctx);
      this.rotationPreview = result.rotationPreview;
      return { cursor: result.cursor };
    }

    if (this.state.type === 'dragging-guide') {
      const result = handleGuideMove(this.state, ctx);
      return { cursor: result.cursor };
    }

    if (this.state.type === 'marquee') {
      const result = handleMarqueeMove(this.state, ctx);
      this.marqueeRect = result.marqueeRect;

      const shapes = getAllShapes(ctx.ydoc);
      this.spatialIndex.rebuild(shapes);
      const marqueeIds = this.getMarqueeHitIds(shapes, ctx.ydoc);
      const store = getToolStore();
      const combined = new Set([...this.state.preMarqueeIds, ...marqueeIds]);
      store.setSelectedIds(Array.from(combined));
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
    const hoveredId = hit ? resolveGroupTarget(ctx.ydoc, hit.id, store.enteredGroupId) : null;
    store.setHoveredId(hoveredId);
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (this.state.type === 'dragging' && this.dragOffset) {
      commitDrag(ctx.ydoc, this.state.initialData, this.dragOffset);
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'resizing' && this.resizePreview) {
      commitResize(ctx.ydoc, this.resizePreview);
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'dragging-endpoint' && this.endpointPreview) {
      commitEndpoint(ctx.ydoc, this.endpointPreview);
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'rotating') {
      if (this.rotationPreview) {
        commitRotation(ctx.ydoc, this.rotationPreview);
      }
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'dragging-guide') {
      this.resetState();
      return { cursor: 'default' };
    }

    if (this.state.type === 'marquee') {
      const store = getToolStore();
      const finalIds = [...store.selectedIds];
      this.resetState();
      store.setSelectedIds(finalIds);
      return { cursor: 'default' };
    }

    this.resetState();
    return { cursor: 'default' };
  }

  onDeactivate(): void {
    this.resetState();
  }

  private resolveParentFrame(shapes: Shape[], selectedIds: string[]): ParentFrameRect | undefined {
    const shapeById = new Map(shapes.map((s) => [s.id, s]));
    let commonParentId: string | null | undefined = undefined;
    for (const id of selectedIds) {
      const shape = shapeById.get(id);
      const pid = shape?.parentId ?? null;
      if (commonParentId === undefined) {
        commonParentId = pid;
      } else if (commonParentId !== pid) {
        return undefined;
      }
    }
    if (!commonParentId) return undefined;
    const parent = shapeById.get(commonParentId);
    if (!parent || parent.type !== 'frame') return undefined;
    return {
      x: parent.x,
      y: parent.y,
      width: parent.width,
      height: parent.height,
      paddingTop: parent.paddingTop,
      paddingRight: parent.paddingRight,
      paddingBottom: parent.paddingBottom,
      paddingLeft: parent.paddingLeft,
    };
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

  private getMarqueeHitIds(shapes: Shape[], ydoc: Y.Doc): string[] {
    if (!this.marqueeRect) return [];
    const { x, y, width, height } = this.marqueeRect;
    const mx = x + width;
    const my = y + height;
    const hits = this.spatialIndex.queryRect(x, y, mx, my);
    const hitIds = new Set(hits.map((h) => h.id));
    const store = getToolStore();

    const rawIds = shapes
      .filter((s) => hitIds.has(s.id) && !s.locked && s.visible)
      .filter((s) => s.x < mx && s.x + s.width > x && s.y < my && s.y + s.height > y)
      .filter((s) => {
        if (s.type !== 'frame' && s.type !== 'group') return true;
        return !(s.x <= x && s.y <= y && s.x + s.width >= mx && s.y + s.height >= my);
      })
      .map((s) => s.id);

    const resolved = new Set<string>();
    for (const id of rawIds) {
      resolved.add(resolveGroupTarget(ydoc, id, store.enteredGroupId));
    }
    return Array.from(resolved);
  }

  private resetState() {
    this.state = { type: 'idle' };
    this.marqueeRect = null;
    this.dragOffset = null;
    this.resizePreview = null;
    this.rotationPreview = null;
    this.endpointPreview = null;
    this.dragInitialData = null;
    this.dragShapesCache = [];
    this.parentFrameCache = undefined;
    this.activeSnapLines = [];
    this.activeDistanceIndicators = [];
  }

  get isManipulating(): boolean {
    return (
      this.state.type === 'dragging' ||
      this.state.type === 'resizing' ||
      this.state.type === 'rotating' ||
      this.state.type === 'dragging-endpoint'
    );
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

  getResizePreview(): Map<string, import('./move-tool-utils').ResizePreviewEntry> | null {
    return this.resizePreview;
  }

  getRotationPreview(): Map<string, number> | null {
    return this.rotationPreview;
  }

  getEndpointPreview(): {
    shapeId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null {
    return this.endpointPreview;
  }

  getSnapLines(): SnapLine[] {
    return this.activeSnapLines;
  }

  getDistanceIndicators(): DistanceIndicator[] {
    return this.activeDistanceIndicators;
  }
}
