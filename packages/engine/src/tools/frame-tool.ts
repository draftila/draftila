import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { addShape, findContainerAtPoint } from '../scene-graph';

export class FrameTool extends BaseTool {
  readonly name = 'frame';
  readonly cursor = 'crosshair';

  private startPoint: { x: number; y: number } | null = null;
  private containerId: string | null = null;
  previewRect: { x: number; y: number; width: number; height: number } | null = null;

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.startPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    getToolStore().setIsDrawing(true);
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.startPoint) return;

    let x = this.startPoint.x;
    let y = this.startPoint.y;
    let width = ctx.canvasPoint.x - x;
    let height = ctx.canvasPoint.y - y;

    if (ctx.shiftKey) {
      const size = Math.max(Math.abs(width), Math.abs(height));
      width = width >= 0 ? size : -size;
      height = height >= 0 ? size : -size;
    }

    if (ctx.altKey) {
      x = this.startPoint.x - Math.abs(width);
      y = this.startPoint.y - Math.abs(height);
      width = Math.abs(width) * 2;
      height = Math.abs(height) * 2;
    } else {
      if (width < 0) {
        x += width;
        width = -width;
      }
      if (height < 0) {
        y += height;
        height = -height;
      }
    }

    this.previewRect = { x, y, width, height };
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (!this.previewRect || this.previewRect.width < 2 || this.previewRect.height < 2) {
      this.reset();
      return;
    }

    const id = addShape(ctx.ydoc, 'frame', {
      x: this.previewRect.x,
      y: this.previewRect.y,
      width: this.previewRect.width,
      height: this.previewRect.height,
      name: 'Frame',
      parentId: this.containerId,
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
    this.containerId = null;
    this.previewRect = null;
    getToolStore().setIsDrawing(false);
  }
}
