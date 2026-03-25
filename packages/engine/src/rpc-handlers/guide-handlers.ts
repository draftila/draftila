import { getPageGuides, addGuide, removeGuide } from '../guides';
import type { RpcHandler } from './types';

export function guideHandlers(): Record<string, RpcHandler> {
  return {
    list_guides(ydoc, args) {
      return { guides: getPageGuides(ydoc, args['pageId'] as string) };
    },

    add_guide(ydoc, args) {
      return {
        guideId: addGuide(
          ydoc,
          args['pageId'] as string,
          args['axis'] as 'x' | 'y',
          args['position'] as number,
        ),
      };
    },

    remove_guide(ydoc, args) {
      removeGuide(ydoc, args['pageId'] as string, args['guideId'] as string);
      return { ok: true };
    },
  };
}
