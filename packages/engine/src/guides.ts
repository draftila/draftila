import * as Y from 'yjs';
import type { CanvasGuide, Point } from '@draftila/shared';

const GUIDE_ID_SIZE = 12;
const GUIDE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateGuideId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GUIDE_ID_SIZE));
  let id = '';
  for (let i = 0; i < GUIDE_ID_SIZE; i++) {
    id += GUIDE_ALPHABET[bytes[i]! % GUIDE_ALPHABET.length];
  }
  return id;
}

type PagesMap = Y.Map<Y.Map<unknown>>;

function getPagesMap(ydoc: Y.Doc): PagesMap {
  return ydoc.getMap('pages') as PagesMap;
}

function getGuidesArray(ydoc: Y.Doc, pageId: string): Y.Array<Y.Map<unknown>> | null {
  const pages = getPagesMap(ydoc);
  const page = pages.get(pageId);
  if (!page) return null;

  let guides = page.get('guides') as Y.Array<Y.Map<unknown>> | undefined;
  if (!guides) {
    guides = new Y.Array<Y.Map<unknown>>();
    page.set('guides', guides);
  }
  return guides;
}

function guideMapToObject(guideMap: Y.Map<unknown>): CanvasGuide {
  return {
    id: guideMap.get('id') as string,
    axis: guideMap.get('axis') as 'x' | 'y',
    position: guideMap.get('position') as number,
  };
}

export function getPageGuides(ydoc: Y.Doc, pageId: string): CanvasGuide[] {
  const guides = getGuidesArray(ydoc, pageId);
  if (!guides) return [];

  const result: CanvasGuide[] = [];
  for (let i = 0; i < guides.length; i++) {
    const guideMap = guides.get(i);
    if (guideMap) {
      result.push(guideMapToObject(guideMap));
    }
  }
  return result;
}

export function addGuide(ydoc: Y.Doc, pageId: string, axis: 'x' | 'y', position: number): string {
  const guides = getGuidesArray(ydoc, pageId);
  if (!guides) return '';

  const id = generateGuideId();
  const guideMap = new Y.Map<unknown>();
  guideMap.set('id', id);
  guideMap.set('axis', axis);
  guideMap.set('position', position);

  guides.push([guideMap]);
  return id;
}

export function updateGuidePosition(
  ydoc: Y.Doc,
  pageId: string,
  guideId: string,
  position: number,
): void {
  const guides = getGuidesArray(ydoc, pageId);
  if (!guides) return;

  for (let i = 0; i < guides.length; i++) {
    const guideMap = guides.get(i);
    if (guideMap && guideMap.get('id') === guideId) {
      guideMap.set('position', position);
      return;
    }
  }
}

export function removeGuide(ydoc: Y.Doc, pageId: string, guideId: string): void {
  const guides = getGuidesArray(ydoc, pageId);
  if (!guides) return;

  for (let i = 0; i < guides.length; i++) {
    const guideMap = guides.get(i);
    if (guideMap && guideMap.get('id') === guideId) {
      guides.delete(i, 1);
      return;
    }
  }
}

export function removeAllGuides(ydoc: Y.Doc, pageId: string): void {
  const guides = getGuidesArray(ydoc, pageId);
  if (!guides || guides.length === 0) return;

  guides.delete(0, guides.length);
}

export function observeGuides(ydoc: Y.Doc, callback: (guides: CanvasGuide[]) => void): () => void {
  const activePageId = getActivePageIdForGuides(ydoc);
  if (!activePageId) {
    callback([]);
    return () => {};
  }

  const guidesArray = getGuidesArray(ydoc, activePageId);
  if (!guidesArray) {
    callback([]);
    return () => {};
  }

  const emit = () => {
    callback(getPageGuides(ydoc, activePageId));
  };

  guidesArray.observeDeep(emit);
  emit();

  return () => {
    guidesArray.unobserveDeep(emit);
  };
}

const GUIDE_HIT_THRESHOLD = 5;

export function hitTestGuide(
  canvasPoint: Point,
  guides: CanvasGuide[],
  zoom: number,
): string | null {
  const threshold = GUIDE_HIT_THRESHOLD / zoom;
  let bestId: string | null = null;
  let bestDistance = threshold;

  for (const guide of guides) {
    const distance =
      guide.axis === 'x'
        ? Math.abs(canvasPoint.x - guide.position)
        : Math.abs(canvasPoint.y - guide.position);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = guide.id;
    }
  }

  return bestId;
}

const activePageByDoc = new WeakMap<Y.Doc, string>();

function getActivePageIdForGuides(ydoc: Y.Doc): string | null {
  const cached = activePageByDoc.get(ydoc);
  if (cached) return cached;

  const pages = getPagesMap(ydoc);
  const pageOrder = ydoc.getArray<string>('pageOrder');
  for (let i = 0; i < pageOrder.length; i++) {
    const id = pageOrder.get(i);
    if (id && pages.has(id)) {
      activePageByDoc.set(ydoc, id);
      return id;
    }
  }
  return null;
}

export function setActivePageForGuides(ydoc: Y.Doc, pageId: string): void {
  activePageByDoc.set(ydoc, pageId);
}

export function getActivePageGuidesArray(ydoc: Y.Doc): Y.Array<Y.Map<unknown>> {
  const pageId = getActivePageIdForGuides(ydoc);
  if (pageId) {
    const arr = getGuidesArray(ydoc, pageId);
    if (arr) return arr;
  }
  return new Y.Array<Y.Map<unknown>>();
}
