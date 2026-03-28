import { BaseTool, getToolStore, type ToolContext } from './base-tool';
import { hitTestPoint } from '../hit-test';
import { SpatialIndex } from '../spatial-index';
import { getAllShapes, findContainerAtPoint } from '../scene-graph';

export interface CommentPlacement {
  x: number;
  y: number;
  parentShapeId: string | null;
}

type CommentToolCallback = (placement: CommentPlacement, ctx: ToolContext) => void;

let onCommentPlaced: CommentToolCallback | null = null;

export function setCommentToolCallback(callback: CommentToolCallback | null) {
  onCommentPlaced = callback;
}

export class CommentTool extends BaseTool {
  readonly name = 'comment';
  readonly cursor = 'crosshair';

  onPointerDown(ctx: ToolContext) {
    const shapes = getAllShapes(ctx.ydoc);
    const spatialIndex = new SpatialIndex();
    spatialIndex.rebuild(shapes);
    const hit = hitTestPoint(
      ctx.canvasPoint.x,
      ctx.canvasPoint.y,
      shapes,
      spatialIndex,
      ctx.camera.zoom,
    );
    const parentShapeId =
      hit?.id ?? findContainerAtPoint(ctx.ydoc, ctx.canvasPoint.x, ctx.canvasPoint.y);
    onCommentPlaced?.(
      {
        x: ctx.canvasPoint.x,
        y: ctx.canvasPoint.y,
        parentShapeId,
      },
      ctx,
    );
    getToolStore().setIsDrawing(false);
  }
}
