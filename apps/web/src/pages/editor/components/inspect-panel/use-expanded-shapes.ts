import { useMemo } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getExpandedShapeIds } from '@draftila/engine/scene-graph';
import { getResolvedShapes } from '@draftila/engine';

export function useExpandedShapes(ydoc: Y.Doc, shapes: Shape[]): Shape[] {
  return useMemo(() => {
    if (shapes.length === 0) return [];
    const ids = shapes.map((s) => s.id);
    const expandedIds = new Set(getExpandedShapeIds(ydoc, ids));
    return getResolvedShapes(ydoc).filter((s) => expandedIds.has(s.id));
  }, [ydoc, shapes]);
}
