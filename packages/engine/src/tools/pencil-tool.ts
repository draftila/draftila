import type { PressurePoint } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { findContainerAtPoint } from '../scene-graph';
import { opCreateShape } from '../operations';
const MIN_DISTANCE_SQ = 4;

export class PencilTool extends BaseTool {
  readonly name = 'pencil';
  readonly cursor = 'crosshair';

  private points: PressurePoint[] = [];
  private isDrawing = false;
  private containerId: string | null = null;
  private pointsDirty = false;
  currentPoints: PressurePoint[] = [];

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.isDrawing = true;
    this.points = [];
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    this.addPoint(ctx, true);
    getToolStore().setIsDrawing(true);
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.isDrawing) return;
    this.addPoint(ctx, false);
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (!this.isDrawing) return;
    this.addPoint(ctx, true);

    if (this.points.length < 2) {
      this.reset();
      return;
    }

    const bounds = this.getBounds();

    const id = opCreateShape(ctx.ydoc, 'path', {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(bounds.width, 1),
      height: Math.max(bounds.height, 1),
      points: this.points,
      parentId: this.containerId,
    });

    this.reset();
  }

  onDeactivate(): void {
    this.reset();
  }

  getCurrentPoints(): PressurePoint[] {
    if (this.pointsDirty) {
      this.currentPoints = this.points;
      this.pointsDirty = false;
    }
    return this.currentPoints;
  }

  private addPoint(ctx: ToolContext, force: boolean) {
    const pressure = (ctx as ToolContext & { pressure?: number }).pressure ?? 0.5;

    if (!force && this.points.length > 0) {
      const last = this.points[this.points.length - 1]!;
      const dx = ctx.canvasPoint.x - last.x;
      const dy = ctx.canvasPoint.y - last.y;
      if (dx * dx + dy * dy < MIN_DISTANCE_SQ) return;
    }

    this.points.push({
      x: ctx.canvasPoint.x,
      y: ctx.canvasPoint.y,
      pressure,
    });
    this.pointsDirty = true;
  }

  private getBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private reset() {
    this.isDrawing = false;
    this.points = [];
    this.containerId = null;
    this.currentPoints = [];
    this.pointsDirty = false;
    getToolStore().setIsDrawing(false);
  }
}
