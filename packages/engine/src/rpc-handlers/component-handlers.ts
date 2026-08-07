import { createComponent, createInstance, listComponents, removeComponent } from '../components';
import { getExpandedShapeIds } from '../scene-graph';
import { toAbsoluteProps } from './utils';
import type { RpcHandler } from './types';

export function componentHandlers(): Record<string, RpcHandler> {
  return {
    create_component(ydoc, args) {
      const shapeIds = getExpandedShapeIds(ydoc, args['shapeIds'] as string[]);
      return {
        componentId: createComponent(ydoc, shapeIds, args['name'] as string),
      };
    },

    create_instance(ydoc, args) {
      const props = toAbsoluteProps(ydoc, {
        x: args['x'],
        y: args['y'],
        parentId: args['parentId'],
      });
      return {
        rootIds: createInstance(
          ydoc,
          args['componentId'] as string,
          props['x'] as number,
          props['y'] as number,
          args['parentId'] as string | undefined,
        ),
      };
    },

    list_components(ydoc) {
      return { components: listComponents(ydoc) };
    },

    remove_component(ydoc, args) {
      return { ok: removeComponent(ydoc, args['componentId'] as string) };
    },
  };
}
