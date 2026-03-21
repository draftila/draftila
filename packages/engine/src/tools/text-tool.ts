import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { addShape, findContainerAtPoint } from '../scene-graph';
import type { SnapLine, DistanceIndicator } from '../snap';
import { snapDrawnTextRect, type DrawSnapState } from './draw-snap';

type TextToolCallback = (shapeId: string) => void;

let onTextCreated: TextToolCallback | null = null;

export function setTextToolCallback(callback: TextToolCallback | null) {
  onTextCreated = callback;
}

const EMPTY_SNAP: DrawSnapState = { snapLines: [], distanceIndicators: [] };

export class TextTool extends BaseTool {
  readonly name = 'text';
  readonly cursor = 'text';

  private startPoint: { x: number; y: number } | null = null;
  private containerId: string | null = null;
  private isDragging = false;
  previewRect: { x: number; y: number; width: number; height: number } | null = null;
  private drawSnap: DrawSnapState = EMPTY_SNAP;

  onPointerDown(ctx: ToolContext): ToolResult | void {
    this.startPoint = { x: ctx.canvasPoint.x, y: ctx.canvasPoint.y };
    this.containerId = findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    this.isDragging = false;
    this.previewRect = null;
    this.drawSnap = EMPTY_SNAP;
    getToolStore().setIsDrawing(true);
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.startPoint) return;

    const dx = ctx.canvasPoint.x - this.startPoint.x;
    const dy = ctx.canvasPoint.y - this.startPoint.y;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      this.isDragging = true;
    }

    if (!this.isDragging) return;

    const { rect, snap } = snapDrawnTextRect(
      ctx.ydoc,
      this.startPoint.x,
      this.startPoint.y,
      ctx.canvasPoint.x,
      ctx.canvasPoint.y,
      ctx.camera.zoom,
      getToolStore().getGuides(),
    );

    this.previewRect = rect;
    this.drawSnap = snap;
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    const store = getToolStore();

    if (
      this.isDragging &&
      this.previewRect &&
      this.previewRect.width > 4 &&
      this.previewRect.height > 4
    ) {
      const id = addShape(ctx.ydoc, 'text', {
        x: this.previewRect.x,
        y: this.previewRect.y,
        width: this.previewRect.width,
        height: this.previewRect.height,
        content: '',
        parentId: this.containerId,
      });

      store.setSelectedIds([id]);
      store.setActiveTool('move');
      onTextCreated?.(id);
    } else {
      const id = addShape(ctx.ydoc, 'text', {
        x: ctx.canvasPoint.x,
        y: ctx.canvasPoint.y,
        width: 200,
        height: 24,
        content: '',
        parentId: this.containerId,
      });

      store.setSelectedIds([id]);
      store.setActiveTool('move');
      onTextCreated?.(id);
    }

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
    this.isDragging = false;
    this.previewRect = null;
    this.drawSnap = EMPTY_SNAP;
    getToolStore().setIsDrawing(false);
  }
}
