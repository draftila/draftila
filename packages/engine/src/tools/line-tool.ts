import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { addShape } from '../scene-graph';

export class LineTool extends BaseTool {
  readonly name = 'line';
  readonly cursor = 'crosshair';

  private startPoint: { x: number; y: number } | null = null;
  previewLine: { x1: number; y1: number; x2: number; y2: number } | null = null;

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.startPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    getToolStore().setIsDrawing(true);
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.startPoint) return;
    let x2 = ctx.canvasPoint.x;
    let y2 = ctx.canvasPoint.y;

    if (ctx.shiftKey) {
      const dx = x2 - this.startPoint.x;
      const dy = y2 - this.startPoint.y;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.sqrt(dx * dx + dy * dy);
      x2 = this.startPoint.x + Math.cos(snapped) * length;
      y2 = this.startPoint.y + Math.sin(snapped) * length;
    }

    this.previewLine = { x1: this.startPoint.x, y1: this.startPoint.y, x2, y2 };
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (!this.previewLine) {
      this.reset();
      return;
    }

    const { x1, y1, x2, y2 } = this.previewLine;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (width < 2 && height < 2) {
      this.reset();
      return;
    }

    const id = addShape(ctx.ydoc, 'line', {
      x: minX,
      y: minY,
      width: Math.max(width, 1),
      height: Math.max(height, 1),
      x1,
      y1,
      x2,
      y2,
    });

    const store = getToolStore();
    store.setSelectedIds([id]);
    store.setActiveTool('move');
    this.reset();
  }

  onDeactivate(): void {
    this.reset();
  }

  private reset() {
    this.startPoint = null;
    this.previewLine = null;
    getToolStore().setIsDrawing(false);
  }
}
