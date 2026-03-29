import { getAllShapes, getShape } from '../scene-graph';
import { isAutoLayoutFrame } from '../auto-layout';
import { applyAutoLayout, applyAutoLayoutForAncestors } from '../scene-graph/layout-ops';
import { exportToSvg } from '../export';
import {
  generateCss,
  generateCssAllLayers,
  generateTailwind,
  generateTailwindAllLayers,
  generateSwiftUI,
  generateCompose,
} from '../codegen';
import { importSvgShapes } from '../shape-import';
import type { RpcHandler } from './types';
import { collectShapesWithDescendants } from './utils';

export function interchangeHandlers(): Record<string, RpcHandler> {
  return {
    export_svg(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      if (ids && ids.length > 0) {
        return exportToSvg(collectShapesWithDescendants(allShapes, ids));
      }
      return exportToSvg(allShapes);
    },

    export_css(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      const shapes =
        ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
      return generateCss(shapes);
    },

    export_css_all_layers(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      const shapes =
        ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
      return generateCssAllLayers(shapes);
    },

    export_tailwind(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      const shapes =
        ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
      return generateTailwind(shapes);
    },

    export_tailwind_all_layers(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      const shapes =
        ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
      return generateTailwindAllLayers(shapes);
    },

    export_swiftui(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      const shapes =
        ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
      return generateSwiftUI(shapes);
    },

    export_compose(ydoc, args) {
      const allShapes = getAllShapes(ydoc);
      const ids = args['shapeIds'] as string[] | undefined;
      const shapes =
        ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;
      return generateCompose(shapes);
    },

    import_svg(ydoc, args) {
      const targetParentId = (args['targetParentId'] as string | undefined) ?? undefined;
      const shapeIds = importSvgShapes(ydoc, args['svg'] as string, {
        targetParentId,
        cursorPosition:
          args['x'] !== undefined && args['y'] !== undefined
            ? { x: args['x'] as number, y: args['y'] as number }
            : undefined,
      });
      if (targetParentId) {
        const parent = getShape(ydoc, targetParentId);
        if (parent && isAutoLayoutFrame(parent)) {
          applyAutoLayout(ydoc, targetParentId);
        }
      }
      const firstShapeId = shapeIds[0];
      if (firstShapeId) {
        applyAutoLayoutForAncestors(ydoc, firstShapeId);
      }
      return { shapeIds };
    },
  };
}
