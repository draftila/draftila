import type * as Y from 'yjs';
import { stripShapeColorVars } from './variables';

/**
 * Stable per-draft identifier, used to tell a same-document paste from a
 * cross-document one.
 *
 * `ydoc.guid` is unusable for this: the editor mints a fresh `Y.Doc` on every
 * mount, so the guid changes across a reload. The draft id is written into the
 * `meta` map once on sync instead.
 */
export function getDocId(ydoc: Y.Doc): string | null {
  const value = ydoc.getMap('meta').get('draftId');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function setDocId(ydoc: Y.Doc, draftId: string) {
  const meta = ydoc.getMap('meta');
  if (meta.get('draftId') === draftId) return;
  meta.set('draftId', draftId);
}

/** Drop colour bindings from a copied style payload (`fills`/`strokes`/`shadows`). */
export function stripStyleColorVars(style: Record<string, unknown>): Record<string, unknown> {
  const shaped = stripShapeColorVars(style as never) as unknown as Record<string, unknown>;
  return { ...style, ...shaped };
}
