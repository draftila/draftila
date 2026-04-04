import type { ToolType } from '@draftila/shared';
import type { BaseTool } from './base-tool';
import { HandTool } from './hand-tool';
import { MoveTool } from './move-tool';
import { CommentTool, setCommentToolCallback } from './comment-tool';
import { RectangleTool } from './rectangle-tool';
import { EllipseTool } from './ellipse-tool';
import { FrameTool } from './frame-tool';
import { TextTool, setTextToolCallback } from './text-tool';
import { PenTool } from './pen-tool';
import { PencilTool } from './pencil-tool';
import { BrushTool } from './brush-tool';
import { NodeTool } from './node-tool';
import { LineTool } from './line-tool';
import { PolygonTool } from './polygon-tool';
import { StarTool } from './star-tool';
import { ArrowTool } from './arrow-tool';

const toolInstances: Record<ToolType, BaseTool> = {
  move: new MoveTool(),
  hand: new HandTool(),
  comment: new CommentTool(),
  rectangle: new RectangleTool(),
  ellipse: new EllipseTool(),
  frame: new FrameTool(),
  text: new TextTool(),
  pen: new PenTool(),
  pencil: new PencilTool(),
  brush: new BrushTool(),
  node: new NodeTool(),
  line: new LineTool(),
  polygon: new PolygonTool(),
  star: new StarTool(),
  arrow: new ArrowTool(),
};

export function getTool(type: ToolType): BaseTool {
  return toolInstances[type];
}

export function getMoveTool(): MoveTool {
  return toolInstances.move as MoveTool;
}

export function getCommentTool(): CommentTool {
  return toolInstances.comment as CommentTool;
}

export function getRectangleTool(): RectangleTool {
  return toolInstances.rectangle as RectangleTool;
}

export function getEllipseTool(): EllipseTool {
  return toolInstances.ellipse as EllipseTool;
}

export function getFrameTool(): FrameTool {
  return toolInstances.frame as FrameTool;
}

export function getPenTool(): PenTool {
  return toolInstances.pen as PenTool;
}

export function getPencilTool(): PencilTool {
  return toolInstances.pencil as PencilTool;
}

export function getLineTool(): LineTool {
  return toolInstances.line as LineTool;
}

export function getArrowTool(): ArrowTool {
  return toolInstances.arrow as ArrowTool;
}

export function getPolygonTool(): PolygonTool {
  return toolInstances.polygon as PolygonTool;
}

export function getStarTool(): StarTool {
  return toolInstances.star as StarTool;
}

export function getTextTool(): TextTool {
  return toolInstances.text as TextTool;
}

export function getBrushTool(): BrushTool {
  return toolInstances.brush as BrushTool;
}

export function getNodeTool(): NodeTool {
  return toolInstances.node as NodeTool;
}

export { setTextToolCallback, setCommentToolCallback };
