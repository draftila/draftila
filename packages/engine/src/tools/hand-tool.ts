import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { panCamera } from '../camera';

export class HandTool extends BaseTool {
  readonly name = 'hand';
  readonly cursor = 'grab';

  private lastScreenPoint: { x: number; y: number } | null = null;
  private isDragging = false;

  onPointerDown(ctx: ToolContext): ToolResult {
    this.lastScreenPoint = { x: ctx.screenPoint.x, y: ctx.screenPoint.y };
    this.isDragging = true;
    getToolStore().setIsPanning(true);
    return { cursor: 'grabbing' };
  }

  onPointerMove(ctx: ToolContext): ToolResult | void {
    if (!this.isDragging) return;
    if (!this.lastScreenPoint) {
      this.lastScreenPoint = { x: ctx.screenPoint.x, y: ctx.screenPoint.y };
      return { cursor: 'grabbing' };
    }

    const dx = ctx.screenPoint.x - this.lastScreenPoint.x;
    const dy = ctx.screenPoint.y - this.lastScreenPoint.y;
    this.lastScreenPoint = { x: ctx.screenPoint.x, y: ctx.screenPoint.y };

    const store = getToolStore();
    store.setCamera(panCamera(store.camera, dx, dy));

    return { cursor: 'grabbing' };
  }

  onPointerUp(_ctx: ToolContext): ToolResult {
    this.lastScreenPoint = null;
    this.isDragging = false;
    getToolStore().setIsPanning(false);
    return { cursor: 'grab' };
  }

  onDeactivate(): void {
    this.lastScreenPoint = null;
    this.isDragging = false;
    getToolStore().setIsPanning(false);
  }
}
