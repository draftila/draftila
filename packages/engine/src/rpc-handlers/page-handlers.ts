import {
  getPages,
  addPage,
  removePage,
  renamePage,
  setPageBackgroundColor,
  setActivePage,
} from '../pages';
import type { RpcHandler } from './types';

export function pageHandlers(): Record<string, RpcHandler> {
  return {
    list_pages(ydoc) {
      return { pages: getPages(ydoc) };
    },

    add_page(ydoc, args) {
      return { pageId: addPage(ydoc, args['name'] as string | undefined) };
    },

    remove_page(ydoc, args) {
      removePage(ydoc, args['pageId'] as string);
      return { ok: true };
    },

    rename_page(ydoc, args) {
      renamePage(ydoc, args['pageId'] as string, args['name'] as string);
      return { ok: true };
    },

    set_page_background(ydoc, args) {
      setPageBackgroundColor(ydoc, args['pageId'] as string, args['color'] as string | null);
      return { ok: true };
    },

    set_active_page(ydoc, args) {
      return { ok: setActivePage(ydoc, args['pageId'] as string) };
    },
  };
}
