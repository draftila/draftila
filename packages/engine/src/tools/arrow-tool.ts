import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { findContainerAtPoint } from '../scene-graph';
import { opCreateShape } from '../operations';
import type { SnapLine, DistanceIndicator } from '../snap';
import { snapDrawnLine, type DrawSnapState } from './draw-snap';

const EMPTY_SNAP: DrawSnapState = { snapLines: [], distanceIndicators: [] };

export class ArrowTool extends BaseTool {
  readonly name = 'arrow';
  readonly cursor = 'crosshair';

  private startPoint: { x: number; y: number } | null = null;
  private containerId: string | null = null;
  previewLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private drawSnap: DrawSnapState = EMPTY_SNAP;

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.startPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
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
      const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.sqrt(dx * dx + dy * dy);
      x2 = this.startPoint.x + Math.cos(snappedAngle) * length;
      y2 = this.startPoint.y + Math.sin(snappedAngle) * length;
    }

    const { line, snap } = snapDrawnLine(
      ctx.ydoc,
      this.startPoint.x,
      this.startPoint.y,
      x2,
      y2,
      ctx.camera.zoom,
      getToolStore().getGuides(),
    );

    this.previewLine = line;
    this.drawSnap = snap;
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

    const id = opCreateShape(ctx.ydoc, 'line', {
      x: minX,
      y: minY,
      width: Math.max(width, 1),
      height: Math.max(height, 1),
      x1,
      y1,
      x2,
      y2,
      endArrowhead: 'line_arrow',
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
    this.previewLine = null;
    this.drawSnap = EMPTY_SNAP;
    getToolStore().setIsDrawing(false);
  }
}
