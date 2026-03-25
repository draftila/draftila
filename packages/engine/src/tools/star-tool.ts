import { ShapeDrawTool } from './shape-draw-tool';

export class StarTool extends ShapeDrawTool {
  constructor() {
    super('star', 'star', { name: 'Star' });
  }
}
