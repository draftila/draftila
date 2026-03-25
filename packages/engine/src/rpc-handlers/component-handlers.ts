import { createComponent, createInstance, listComponents, removeComponent } from '../components';
import type { RpcHandler } from './types';

export function componentHandlers(): Record<string, RpcHandler> {
  return {
    create_component(ydoc, args) {
      return {
        componentId: createComponent(ydoc, args['shapeIds'] as string[], args['name'] as string),
      };
    },

    create_instance(ydoc, args) {
      return {
        rootIds: createInstance(
          ydoc,
          args['componentId'] as string,
          args['x'] as number,
          args['y'] as number,
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
