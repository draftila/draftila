import type { Shape, ShapeType, ToolType } from '@draftila/shared';
import { BaseTool, getToolStore, type ToolContext, type ToolResult } from './base-tool';
import { findContainerAtPoint } from '../scene-graph';
import { opCreateShape } from '../operations';
import type { SnapLine, DistanceIndicator } from '../snap';
import { snapDrawnRect, type DrawSnapState } from './draw-snap';

const EMPTY_SNAP: DrawSnapState = { snapLines: [], distanceIndicators: [] };

export class ShapeDrawTool extends BaseTool {
  readonly name: ToolType;
  readonly cursor = 'crosshair';

  private readonly shapeType: ShapeType;
  private readonly extraProps: Partial<Shape>;

  private startPoint: { x: number; y: number } | null = null;
  private containerId: string | null = null;
  previewRect: { x: number; y: number; width: number; height: number } | null = null;
  private drawSnap: DrawSnapState = EMPTY_SNAP;

  constructor(name: ToolType, shapeType: ShapeType, extraProps?: Partial<Shape>) {
    super();
    this.name = name;
    this.shapeType = shapeType;
    this.extraProps = extraProps ?? {};
  }

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
      getToolStore().getGuides(),
    );

    this.previewRect = rect;
    this.drawSnap = snap;
  }

  onPointerUp(ctx: ToolContext): ToolResult | void {
    if (!this.previewRect || this.previewRect.width < 2 || this.previewRect.height < 2) {
      this.reset();
      return;
    }

    const id = opCreateShape(ctx.ydoc, this.shapeType, {
      x: this.previewRect.x,
      y: this.previewRect.y,
      width: this.previewRect.width,
      height: this.previewRect.height,
      parentId: this.containerId,
      ...this.extraProps,
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
