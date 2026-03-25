import { ShapeDrawTool } from './shape-draw-tool';

export class FrameTool extends ShapeDrawTool {
  constructor() {
    super('frame', 'frame', { name: 'Frame' });
  }
}
