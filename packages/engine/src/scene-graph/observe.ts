import * as Y from 'yjs';
import { getShapesMap, getZOrder } from './hierarchy';
import type { ShapeChangeCallback } from './types';

export function observeShapes(ydoc: Y.Doc, callback: ShapeChangeCallback): () => void {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);

  const handleShapeMapChange = (events: Y.YEvent<Y.Map<unknown>>[]) => {
    const added: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];

    for (const event of events) {
      if (event.target === shapes) {
        event.changes.keys.forEach((change, key) => {
          if (change.action === 'add') added.push(key);
          else if (change.action === 'delete') deleted.push(key);
          else if (change.action === 'update') updated.push(key);
        });
      } else {
        // `event.path` is relative to the observed shapes map, so path[0] is the
        // shape id. Prefer it over target.get('id'): a write nested inside an
        // array item (a fill's colorVar, say) targets that item's Y.Map, which
        // carries no id — and the change would otherwise be dropped entirely.
        const path = event.path[0];
        const id = typeof path === 'string' ? path : (event.target.get('id') as string | undefined);
        if (id && !updated.includes(id)) {
          updated.push(id);
        }
      }
    }

    if (added.length > 0 || updated.length > 0 || deleted.length > 0) {
      callback({ added, updated, deleted });
    }
  };

  const handleZOrderChange = () => {
    callback({ added: [], updated: zOrder.toArray(), deleted: [] });
  };

  shapes.observeDeep(handleShapeMapChange);
  zOrder.observe(handleZOrderChange);
  return () => {
    shapes.unobserveDeep(handleShapeMapChange);
    zOrder.unobserve(handleZOrderChange);
  };
}
