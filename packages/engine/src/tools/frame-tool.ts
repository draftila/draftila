import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { addShape, findContainerAtPoint } from '../scene-graph';
import type { SnapLine, DistanceIndicator } from '../snap';
import { snapDrawnRect, type DrawSnapState } from './draw-snap';

const EMPTY_SNAP: DrawSnapState = { snapLines: [], distanceIndicators: [] };

export class FrameTool extends BaseTool {
  readonly name = 'frame';
  readonly cursor = 'crosshair';

  private startPoint: { x: number; y: number } | null = null;
  private containerId: string | null = null;
  previewRect: { x: number; y: number; width: number; height: number } | null = null;
  private drawSnap: DrawSnapState = EMPTY_SNAP;

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.startPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    getToolStore().setIsDrawing(true);
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.startPoint) return;

    const { rect, snap } = snapDrawnRect(
      ctx.ydoc,
      this.startPoint.x,
      this.startPoint.y,
      ctx.canvasPoint.x,
      ctx.canvasPoint.y,
      ctx.shiftKey,
      ctx.altKey,
      ctx.camera.zoom,
    );

    this.previewRect = rect;
    this.drawSnap = snap;
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

  getSnapLines(): SnapLine[] {
    return this.drawSnap.snapLines;
  }

  getDistanceIndicators(): DistanceIndicator[] {
    return this.drawSnap.distanceIndicators;
  }

  private reset() {
    this.startPoint = null;
    this.containerId = null;
    this.previewRect = null;
    this.drawSnap = EMPTY_SNAP;
    getToolStore().setIsDrawing(false);
  }
}
