import type { PressurePoint, VectorNode } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { addShape, findContainerAtPoint } from '../scene-graph';
import { vectorNodesToSvgPath } from '../vector-nodes';
import { normalizePathToOrigin } from '../path-gen';

const CLOSE_DISTANCE = 10;
const DOUBLE_CLICK_MS = 300;
const HANDLE_THRESHOLD = 2;

export class PenTool extends BaseTool {
  readonly name = 'pen';
  readonly cursor = 'crosshair';

  private nodes: VectorNode[] = [];
  private freehandPoints: PressurePoint[] = [];
  private freehandMode = false;
  private isBuilding = false;
  private isDraggingHandle = false;
  private draggedNodeIndex = -1;
  private dragMoved = false;
  private hoverPoint: { x: number; y: number } | null = null;
  private containerId: string | null = null;
  private lastPointerDownAt = 0;
  private lastPointerDownPoint: { x: number; y: number } | null = null;

  getPreviewPathData(): string | null {
    if (this.nodes.length === 0) return null;

    const previewNodes = this.nodes.map((node) => ({ ...node }));
    if (this.hoverPoint && !this.isDraggingHandle) {
      const last = previewNodes[previewNodes.length - 1];
      if (last) {
        const dx = this.hoverPoint.x - last.x;
        const dy = this.hoverPoint.y - last.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.5) {
          previewNodes.push({
            x: this.hoverPoint.x,
            y: this.hoverPoint.y,
            handleInX: 0,
            handleInY: 0,
            handleOutX: 0,
            handleOutY: 0,
            type: 'corner',
          });
        }
      }
    }

    if (previewNodes.length < 2) return null;
    return vectorNodesToSvgPath([{ nodes: previewNodes, closed: false }]);
  }

  getPlacedNodes(): VectorNode[] {
    return this.nodes;
  }

  getFreehandPoints(): PressurePoint[] {
    return this.freehandPoints;
  }

  onPointerDown(ctx: ToolContext): ToolResult | void {
    if (ctx.altKey) {
      this.startFreehand(ctx);
      return;
    }

    const now = Date.now();
    const currentPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    const isDoubleClick =
      this.lastPointerDownPoint &&
      now - this.lastPointerDownAt <= DOUBLE_CLICK_MS &&
      Math.hypot(
        currentPoint.x - this.lastPointerDownPoint.x,
        currentPoint.y - this.lastPointerDownPoint.y,
      ) <=
        CLOSE_DISTANCE / ctx.camera.zoom;

    this.lastPointerDownAt = now;
    this.lastPointerDownPoint = currentPoint;
    this.hoverPoint = currentPoint;

    if (!this.isBuilding) {
      this.isBuilding = true;
      this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
      this.nodes = [];
      getToolStore().setIsDrawing(true);
    }

    if (this.nodes.length >= 2 && isDoubleClick) {
      this.commit(ctx, false);
      return;
    }

    if (this.nodes.length >= 3 && this.isNearFirstNode(ctx)) {
      this.commit(ctx, true);
      return;
    }

    const newNode: VectorNode = {
      x: ctx.canvasPoint.x,
      y: ctx.canvasPoint.y,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      type: 'corner',
    };

    this.nodes.push(newNode);
    this.draggedNodeIndex = this.nodes.length - 1;
    this.isDraggingHandle = true;
    this.dragMoved = false;
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (this.freehandMode) {
      this.addFreehandPoint(ctx);
      return;
    }

    this.hoverPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    if (!this.isDraggingHandle || this.draggedNodeIndex < 0) return;

    const node = this.nodes[this.draggedNodeIndex];
    if (!node) return;

    const dx = ctx.canvasPoint.x - node.x;
    const dy = ctx.canvasPoint.y - node.y;
    const distance = Math.hypot(dx, dy);
    this.dragMoved = this.dragMoved || distance > HANDLE_THRESHOLD / ctx.camera.zoom;

    if (!this.dragMoved) return;

    node.handleOutX = dx;
    node.handleOutY = dy;
    node.handleInX = -dx;
    node.handleInY = -dy;
    node.type = 'smooth';
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (this.freehandMode) {
      this.finishFreehand(ctx);
      return;
    }

    this.hoverPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    if (!this.isDraggingHandle || this.draggedNodeIndex < 0) return;

    const node = this.nodes[this.draggedNodeIndex];
    if (node && !this.dragMoved) {
      node.handleInX = 0;
      node.handleInY = 0;
      node.handleOutX = 0;
      node.handleOutY = 0;
      node.type = 'corner';
    }

    this.isDraggingHandle = false;
    this.draggedNodeIndex = -1;
    this.dragMoved = false;
  }

  onKeyDown(key: string, ctx: ToolContext): ToolResult | void {
    if (this.freehandMode && key === 'Escape') {
      this.reset();
      return;
    }

    if (!this.isBuilding) return;

    if (key === 'Enter') {
      this.commit(ctx, false);
      return;
    }

    if (key === 'Escape') {
      this.reset();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      if (this.nodes.length > 0) {
        this.nodes.pop();
      }
      if (this.nodes.length === 0) {
        this.reset();
      }
    }
  }

  onDeactivate(): void {
    this.reset();
  }

  private isNearFirstNode(ctx: ToolContext): boolean {
    const first = this.nodes[0];
    if (!first) return false;
    const distance = Math.hypot(ctx.canvasPoint.x - first.x, ctx.canvasPoint.y - first.y);
    return distance <= CLOSE_DISTANCE / ctx.camera.zoom;
  }

  private commit(ctx: ToolContext, closed: boolean) {
    if (this.nodes.length < 2) {
      this.reset();
      return;
    }

    const rawPath = vectorNodesToSvgPath([{ nodes: this.nodes, closed }]);
    const normalized = normalizePathToOrigin(rawPath);

    const id = addShape(ctx.ydoc, 'path', {
      x: normalized.bounds.x,
      y: normalized.bounds.y,
      width: Math.max(1, normalized.bounds.width),
      height: Math.max(1, normalized.bounds.height),
      svgPathData: normalized.pathData,
      parentId: this.containerId,
    });

    getToolStore().setSelectedIds([id]);
    this.reset();
  }

  private reset() {
    this.nodes = [];
    this.freehandPoints = [];
    this.freehandMode = false;
    this.isBuilding = false;
    this.isDraggingHandle = false;
    this.draggedNodeIndex = -1;
    this.dragMoved = false;
    this.hoverPoint = null;
    this.containerId = null;
    this.lastPointerDownAt = 0;
    this.lastPointerDownPoint = null;
    getToolStore().setIsDrawing(false);
  }

  private startFreehand(ctx: ToolContext) {
    this.reset();
    this.freehandMode = true;
    this.isBuilding = false;
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    getToolStore().setIsDrawing(true);
    this.addFreehandPoint(ctx);
  }

  private addFreehandPoint(ctx: ToolContext) {
    const pressure = (ctx as ToolContext & { pressure?: number }).pressure ?? 0.5;
    this.freehandPoints.push({
      x: ctx.canvasPoint.x,
      y: ctx.canvasPoint.y,
      pressure,
    });
  }

  private finishFreehand(ctx: ToolContext) {
    this.addFreehandPoint(ctx);

    if (this.freehandPoints.length < 2) {
      this.reset();
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.freehandPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const id = addShape(ctx.ydoc, 'path', {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      points: this.freehandPoints.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })),
      parentId: this.containerId,
    });

    getToolStore().setSelectedIds([id]);
    this.reset();
  }
}
