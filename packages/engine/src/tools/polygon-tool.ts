import { ShapeDrawTool } from './shape-draw-tool';

export class PolygonTool extends ShapeDrawTool {
  constructor() {
    super('polygon', 'polygon', { name: 'Polygon' });
  }
}
