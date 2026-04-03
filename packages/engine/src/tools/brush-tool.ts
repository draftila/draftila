import type { BrushSettings, PressurePoint } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { findContainerAtPoint } from '../scene-graph';
import { opCreateShape } from '../operations';

const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 8,
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
};

export class BrushTool extends BaseTool {
  readonly name = 'brush';
  readonly cursor = 'crosshair';

  private points: PressurePoint[] = [];
  private isDrawing = false;
  private containerId: string | null = null;
  currentPoints: PressurePoint[] = [];
  brushSettings: BrushSettings = { ...DEFAULT_BRUSH_SETTINGS };

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.isDrawing = true;
    this.points = [];
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    this.addPoint(ctx);
    getToolStore().setIsDrawing(true);
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.isDrawing) return;
    this.addPoint(ctx);
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (!this.isDrawing) return;
    this.addPoint(ctx);

    if (this.points.length < 2) {
      this.reset();
      return;
    }

    const bounds = this.getBounds();
    const normalizedPoints = this.points.map((p) => ({
      x: p.x,
      y: p.y,
      pressure: p.pressure,
    }));

    const id = opCreateShape(ctx.ydoc, 'path', {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(bounds.width, 1),
      height: Math.max(bounds.height, 1),
      points: normalizedPoints,
      brushSettings: { ...this.brushSettings },
      parentId: this.containerId,
    });

    const store = getToolStore();
    store.setSelectedIds([id]);
    this.reset();
  }

  onDeactivate(): void {
    this.reset();
  }

  private addPoint(ctx: ToolContext) {
    const pressure = (ctx as ToolContext & { pressure?: number }).pressure ?? 0.5;
    const point: PressurePoint = {
      x: ctx.canvasPoint.x,
      y: ctx.canvasPoint.y,
      pressure,
    };
    this.points.push(point);
    this.currentPoints = [...this.points];
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
    getToolStore().setIsDrawing(false);
  }
}
