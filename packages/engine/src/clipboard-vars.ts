import type * as Y from 'yjs';
import { stripShapeColorVars } from './variables';

export function getDocId(ydoc: Y.Doc): string | null {
  const value = ydoc.getMap('meta').get('draftId');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function setDocId(ydoc: Y.Doc, draftId: string) {
  const meta = ydoc.getMap('meta');
  if (meta.get('draftId') === draftId) return;
  meta.set('draftId', draftId);
}

export function stripStyleColorVars(style: Record<string, unknown>): Record<string, unknown> {
  const shaped = stripShapeColorVars(style as never) as unknown as Record<string, unknown>;
  return { ...style, ...shaped };
}
