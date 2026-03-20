import * as Y from 'yjs';

const PAGE_ID_SIZE = 12;
const PAGE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const DEFAULT_PAGE_BACKGROUND = '#333333';

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
  backgroundColor: string;
}

type PagesMap = Y.Map<Y.Map<unknown>>;

const activePageByDoc = new WeakMap<Y.Doc, string>();

function getPagesMap(ydoc: Y.Doc): PagesMap {
  return ydoc.getMap('pages') as PagesMap;
}

function getPageOrder(ydoc: Y.Doc): Y.Array<string> {
  return ydoc.getArray<string>('pageOrder');
}

function cloneYValue(value: unknown): unknown {
  if (value instanceof Y.Map) {
    const next = new Y.Map<unknown>();
    value.forEach((entry, key) => {
      next.set(key, cloneYValue(entry));
    });
    return next;
  }

  if (value instanceof Y.Array) {
    const next = new Y.Array<unknown>();
    for (const entry of value.toArray()) {
      next.push([cloneYValue(entry)]);
    }
    return next;
  }

  return value;
}

function createPage(id: string, name: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set('id', id);
  page.set('name', name);
  page.set('backgroundColor', DEFAULT_PAGE_BACKGROUND);
  page.set('shapes', new Y.Map<unknown>());
  page.set('zOrder', new Y.Array<string>());
  return page;
}

function getFirstPageId(ydoc: Y.Doc): string | null {
  const pageOrder = getPageOrder(ydoc);
  for (let i = 0; i < pageOrder.length; i++) {
    const id = pageOrder.get(i);
    if (id) return id;
  }
  return null;
}

function ensureActivePage(ydoc: Y.Doc): string | null {
  const pages = getPagesMap(ydoc);
  const active = activePageByDoc.get(ydoc);

  if (active && pages.has(active)) {
    return active;
  }

  const fallback = getFirstPageId(ydoc);
  if (!fallback) {
    return null;
  }

  activePageByDoc.set(ydoc, fallback);
  return fallback;
}

export function initPages(ydoc: Y.Doc) {
  getPagesMap(ydoc);
  getPageOrder(ydoc);
  ensureActivePage(ydoc);
}

export function ensureDefaultPage(ydoc: Y.Doc): string {
  const existing = ensureActivePage(ydoc);
  if (existing) {
    return existing;
  }

  const pages = getPagesMap(ydoc);
  const pageOrder = getPageOrder(ydoc);
  const legacyShapes = ydoc.getMap('shapes') as Y.Map<Y.Map<unknown>>;
  const legacyZOrder = ydoc.getArray<string>('zOrder');

  const defaultId = generatePageId();
  const page = createPage(defaultId, 'Page 1');
  const pageShapes = page.get('shapes') as Y.Map<unknown>;
  const pageZOrder = page.get('zOrder') as Y.Array<string>;

  legacyShapes.forEach((shapeData, shapeId) => {
    pageShapes.set(shapeId, cloneYValue(shapeData));
  });

  const orderedIds = legacyZOrder.toArray();
  if (orderedIds.length > 0) {
    pageZOrder.push(orderedIds);
  }

  ydoc.transact(() => {
    pages.set(defaultId, page);
    pageOrder.push([defaultId]);
  });

  activePageByDoc.set(ydoc, defaultId);
  return defaultId;
}

export function getPages(ydoc: Y.Doc): PageData[] {
  const pages = getPagesMap(ydoc);
  const pageOrder = getPageOrder(ydoc);
  const result: PageData[] = [];

  for (let i = 0; i < pageOrder.length; i++) {
    const id = pageOrder.get(i);
    const page = pages.get(id);
    if (page) {
      result.push({
        id,
        name: (page.get('name') as string) ?? 'Untitled',
        backgroundColor:
          (page.get('backgroundColor') as string | undefined) ?? DEFAULT_PAGE_BACKGROUND,
      });
    }
  }

  return result;
}

export function addPage(ydoc: Y.Doc, name?: string): string {
  const pages = getPagesMap(ydoc);
  const pageOrder = getPageOrder(ydoc);

  const id = generatePageId();
  const pageName = name ?? `Page ${pageOrder.length + 1}`;
  const page = createPage(id, pageName);

  ydoc.transact(() => {
    pages.set(id, page);
    pageOrder.push([id]);
  });

  return id;
}

export function removePage(ydoc: Y.Doc, pageId: string) {
  const pages = getPagesMap(ydoc);
  const pageOrder = getPageOrder(ydoc);

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

  const active = activePageByDoc.get(ydoc);
  if (active === pageId) {
    const fallback = ensureActivePage(ydoc);
    if (!fallback) {
      activePageByDoc.delete(ydoc);
    }
  }
}

export function renamePage(ydoc: Y.Doc, pageId: string, name: string) {
  const pages = getPagesMap(ydoc);
  const page = pages.get(pageId);
  if (page) {
    page.set('name', name);
  }
}

export function setPageBackgroundColor(ydoc: Y.Doc, pageId: string, color: string | null) {
  const pages = getPagesMap(ydoc);
  const page = pages.get(pageId);
  if (page) {
    if (color === null) {
      page.delete('backgroundColor');
    } else {
      page.set('backgroundColor', color);
    }
  }
}

export function getPageBackgroundColor(ydoc: Y.Doc, pageId: string): string {
  const pages = getPagesMap(ydoc);
  const page = pages.get(pageId);
  if (!page) return DEFAULT_PAGE_BACKGROUND;
  return (page.get('backgroundColor') as string | undefined) ?? DEFAULT_PAGE_BACKGROUND;
}

export function setActivePage(ydoc: Y.Doc, pageId: string): boolean {
  const pages = getPagesMap(ydoc);
  if (!pages.has(pageId)) return false;
  activePageByDoc.set(ydoc, pageId);
  return true;
}

export function getActivePageId(ydoc: Y.Doc): string | null {
  return ensureActivePage(ydoc);
}

export function getActivePageShapesMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  const legacyShapes = ydoc.getMap('shapes') as Y.Map<Y.Map<unknown>>;
  const pages = getPagesMap(ydoc);
  const activePageId = ensureActivePage(ydoc);
  if (!activePageId) {
    return legacyShapes;
  }
  const page = pages.get(activePageId);
  if (!page) {
    return legacyShapes;
  }

  let shapes = page.get('shapes') as Y.Map<Y.Map<unknown>> | undefined;
  if (!shapes) {
    shapes = new Y.Map<Y.Map<unknown>>();
    page.set('shapes', shapes);
  }
  return shapes;
}

export function getActivePageZOrder(ydoc: Y.Doc): Y.Array<string> {
  const legacyZOrder = ydoc.getArray<string>('zOrder');
  const pages = getPagesMap(ydoc);
  const activePageId = ensureActivePage(ydoc);
  if (!activePageId) {
    return legacyZOrder;
  }
  const page = pages.get(activePageId);
  if (!page) {
    return legacyZOrder;
  }

  let zOrder = page.get('zOrder') as Y.Array<string> | undefined;
  if (!zOrder) {
    zOrder = new Y.Array<string>();
    page.set('zOrder', zOrder);
  }
  return zOrder;
}

export function observePages(
  ydoc: Y.Doc,
  callback: (pages: PageData[], activePageId: string | null) => void,
): () => void {
  const pages = getPagesMap(ydoc);
  const pageOrder = getPageOrder(ydoc);

  const emit = () => {
    callback(getPages(ydoc), ensureActivePage(ydoc));
  };

  const handlePagesChange = () => {
    emit();
  };

  const handleOrderChange = () => {
    emit();
  };

  pages.observeDeep(handlePagesChange);
  pageOrder.observe(handleOrderChange);
  emit();

  return () => {
    pages.unobserveDeep(handlePagesChange);
    pageOrder.unobserve(handleOrderChange);
  };
}
