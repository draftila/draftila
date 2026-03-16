import * as Y from 'yjs';

const PAGE_ID_SIZE = 12;
const PAGE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generatePageId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PAGE_ID_SIZE));
  let id = '';
  for (let i = 0; i < PAGE_ID_SIZE; i++) {
    id += PAGE_ALPHABET[bytes[i]! % PAGE_ALPHABET.length];
  }
  return id;
}

export interface PageData {
  id: string;
  name: string;
}

export function initPages(ydoc: Y.Doc) {
  const pages = ydoc.getMap('pages');
  const pageOrder = ydoc.getArray<string>('pageOrder');

  if (pageOrder.length === 0) {
    const defaultId = generatePageId();
    const page = new Y.Map<unknown>();
    page.set('id', defaultId);
    page.set('name', 'Page 1');
    page.set('shapes', new Y.Map());
    page.set('zOrder', new Y.Array());

    ydoc.transact(() => {
      pages.set(defaultId, page);
      pageOrder.push([defaultId]);
    });
  }
}

export function getPages(ydoc: Y.Doc): PageData[] {
  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  const pageOrder = ydoc.getArray<string>('pageOrder');
  const result: PageData[] = [];

  for (let i = 0; i < pageOrder.length; i++) {
    const id = pageOrder.get(i);
    const page = pages.get(id);
    if (page) {
      result.push({
        id,
        name: (page.get('name') as string) ?? 'Untitled',
      });
    }
  }

  return result;
}

export function addPage(ydoc: Y.Doc, name?: string): string {
  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  const pageOrder = ydoc.getArray<string>('pageOrder');

  const id = generatePageId();
  const pageName = name ?? `Page ${pageOrder.length + 1}`;
  const page = new Y.Map<unknown>();
  page.set('id', id);
  page.set('name', pageName);
  page.set('shapes', new Y.Map());
  page.set('zOrder', new Y.Array());

  ydoc.transact(() => {
    pages.set(id, page);
    pageOrder.push([id]);
  });

  return id;
}

export function removePage(ydoc: Y.Doc, pageId: string) {
  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  const pageOrder = ydoc.getArray<string>('pageOrder');

  if (pageOrder.length <= 1) return;

  ydoc.transact(() => {
    pages.delete(pageId);
    for (let i = 0; i < pageOrder.length; i++) {
      if (pageOrder.get(i) === pageId) {
        pageOrder.delete(i, 1);
        break;
      }
    }
  });
}

export function renamePage(ydoc: Y.Doc, pageId: string, name: string) {
  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  const page = pages.get(pageId);
  if (page) {
    page.set('name', name);
  }
}
