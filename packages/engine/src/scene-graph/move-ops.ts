import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { transformPath } from '../path-gen';
import {
  getShapesMap,
  getZOrder,
  getShapeSnapshotMap,
  getOrderedIds,
  getSiblingIdsForParent,
  getTopLevelIds,
  canContainChildren,
  wouldCreateParentCycle,
  getShapeBoundingRect,
  getValidParentId,
} from './hierarchy';
import { replaceZOrder, reorderSiblingIds, applySiblingOrder } from './z-order';
import { updateShape } from './shape-crud';
import { getExpandedShapeIds } from './query-ops';
import type { StackMoveDirection, LayerDropPlacement } from './types';

export function moveShapesInStack(
  ydoc: Y.Doc,
  ids: string[],
  direction: StackMoveDirection,
): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
  const topLevelIds = getTopLevelIds(ids, shapeMap);

  if (topLevelIds.length === 0) return [];

  const selectedByParent = new Map<string | null, Set<string>>();

  for (const id of topLevelIds) {
    const shape = shapeMap.get(id);
    if (!shape) continue;
    const parentId = getValidParentId(shapeMap, shape.parentId ?? null);
    const set = selectedByParent.get(parentId);
    if (set) {
      set.add(id);
    } else {
      selectedByParent.set(parentId, new Set([id]));
    }
  }

  ydoc.transact(() => {
    let nextOrder = [...orderedIds];

    for (const [parentId, selectedSet] of selectedByParent) {
      const siblingIds = getSiblingIdsForParent(parentId, shapeMap, nextOrder);
      if (siblingIds.length <= 1) continue;

      const selectedSiblings = siblingIds.filter((id) => selectedSet.has(id));
      if (selectedSiblings.length === 0 || selectedSiblings.length === siblingIds.length) continue;

      const nextSiblingIds = reorderSiblingIds(siblingIds, selectedSet, direction);
      nextOrder = applySiblingOrder(nextOrder, siblingIds, nextSiblingIds);
    }

    replaceZOrder(zOrder, nextOrder);
  });

  return topLevelIds;
}

export function moveShapesByDrop(
  ydoc: Y.Doc,
  ids: string[],
  targetId: string,
  placement: LayerDropPlacement,
): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
  const movingIds = getTopLevelIds(ids, shapeMap);

  if (movingIds.length === 0) return [];

  const targetShape = shapeMap.get(targetId);
  if (!targetShape) return [];

  const movingSet = new Set(movingIds);
  if (movingSet.has(targetId) && placement !== 'inside') return movingIds;

  let nextParentId: string | null;
  let siblingInsertionIndex = 0;

  if (placement === 'inside') {
    if (!canContainChildren(targetShape)) return [];
    nextParentId = targetShape.id;
    const siblingIds = getSiblingIdsForParent(nextParentId, shapeMap, orderedIds).filter(
      (id) => !movingSet.has(id),
    );
    siblingInsertionIndex = siblingIds.length;
  } else {
    nextParentId = getValidParentId(shapeMap, targetShape.parentId ?? null);
    const siblingIds = getSiblingIdsForParent(nextParentId, shapeMap, orderedIds);
    const remainingSiblings = siblingIds.filter((id) => !movingSet.has(id));
    const targetIndex = remainingSiblings.indexOf(targetId);
    if (targetIndex < 0) return [];
    siblingInsertionIndex = placement === 'before' ? targetIndex + 1 : targetIndex;
  }

  if (wouldCreateParentCycle(shapeMap, movingSet, nextParentId)) return [];

  const movingOrdered = orderedIds.filter((id) => movingSet.has(id));
  const remainingOrder = orderedIds.filter((id) => !movingSet.has(id));
  const targetSiblings = getSiblingIdsForParent(nextParentId, shapeMap, remainingOrder);

  let globalInsertionIndex = remainingOrder.length;

  if (targetSiblings.length > 0) {
    if (siblingInsertionIndex <= 0) {
      const firstSiblingId = targetSiblings[0];
      globalInsertionIndex = firstSiblingId ? remainingOrder.indexOf(firstSiblingId) : 0;
    } else if (siblingInsertionIndex >= targetSiblings.length) {
      const lastSiblingId = targetSiblings[targetSiblings.length - 1];
      const lastSiblingIndex = lastSiblingId ? remainingOrder.lastIndexOf(lastSiblingId) : -1;
      globalInsertionIndex = lastSiblingIndex >= 0 ? lastSiblingIndex + 1 : remainingOrder.length;
    } else {
      const siblingIdAtIndex = targetSiblings[siblingInsertionIndex];
      globalInsertionIndex = siblingIdAtIndex
        ? remainingOrder.indexOf(siblingIdAtIndex)
        : remainingOrder.length;
    }
  }

  if (globalInsertionIndex < 0) {
    globalInsertionIndex = remainingOrder.length;
  }

  const nextOrder = [
    ...remainingOrder.slice(0, globalInsertionIndex),
    ...movingOrdered,
    ...remainingOrder.slice(globalInsertionIndex),
  ];

  const shapes = getShapesMap(ydoc);

  ydoc.transact(() => {
    for (const id of movingIds) {
      const shapeData = shapes.get(id);
      if (!shapeData) continue;
      shapeData.set('parentId', nextParentId);
    }
    replaceZOrder(zOrder, nextOrder);
  });

  return movingIds;
}

export function nudgeShapes(ydoc: Y.Doc, ids: string[], dx: number, dy: number) {
  const shapes = getShapesMap(ydoc);
  const movableIds = getExpandedShapeIds(ydoc, ids);

  ydoc.transact(() => {
    for (const id of movableIds) {
      const shapeData = shapes.get(id);
      if (!shapeData) continue;

      const shapeType = shapeData.get('type') as string;

      shapeData.set('x', (shapeData.get('x') as number) + dx);
      shapeData.set('y', (shapeData.get('y') as number) + dy);

      if (shapeType === 'line' || shapeType === 'arrow') {
        shapeData.set('x1', (shapeData.get('x1') as number) + dx);
        shapeData.set('y1', (shapeData.get('y1') as number) + dy);
        shapeData.set('x2', (shapeData.get('x2') as number) + dx);
        shapeData.set('y2', (shapeData.get('y2') as number) + dy);
      }

      if (shapeType === 'path') {
        const points = shapeData.get('points');
        if (points instanceof Y.Array) {
          for (let i = 0; i < points.length; i++) {
            const point = points.get(i);
            if (point instanceof Y.Map) {
              point.set('x', (point.get('x') as number) + dx);
              point.set('y', (point.get('y') as number) + dy);
            }
          }
        }
      }
    }
  });
}

export function flipShapes(ydoc: Y.Doc, ids: string[], axis: 'horizontal' | 'vertical'): void {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const topLevelIds = getTopLevelIds(ids, shapeMap);
  if (topLevelIds.length === 0) return;

  const selectedShapes = topLevelIds
    .map((id) => shapeMap.get(id))
    .filter((shape): shape is Shape => Boolean(shape));

  if (selectedShapes.length === 0) return;

  const bounds = getShapeBoundingRect(selectedShapes);
  if (!bounds) return;

  const isMulti = selectedShapes.length > 1;

  ydoc.transact(() => {
    for (const shape of selectedShapes) {
      const update: Record<string, unknown> = {};

      if (isMulti) {
        if (axis === 'horizontal') {
          update.x = bounds.x + (bounds.x + bounds.width - (shape.x + shape.width));
        } else {
          update.y = bounds.y + (bounds.y + bounds.height - (shape.y + shape.height));
        }
      }

      if (shape.rotation !== 0) {
        update.rotation = -shape.rotation;
      }

      if (shape.type === 'line' || shape.type === 'arrow') {
        const s = shape as Shape & { x1: number; y1: number; x2: number; y2: number };
        if (axis === 'horizontal') {
          const newX = (update.x as number | undefined) ?? shape.x;
          update.x1 = newX + (shape.width - (s.x1 - shape.x));
          update.x2 = newX + (shape.width - (s.x2 - shape.x));
          update.y1 = s.y1 - shape.y + ((update.y as number | undefined) ?? shape.y);
          update.y2 = s.y2 - shape.y + ((update.y as number | undefined) ?? shape.y);
        } else {
          update.x1 = s.x1 - shape.x + ((update.x as number | undefined) ?? shape.x);
          update.x2 = s.x2 - shape.x + ((update.x as number | undefined) ?? shape.x);
          const newY = (update.y as number | undefined) ?? shape.y;
          update.y1 = newY + (shape.height - (s.y1 - shape.y));
          update.y2 = newY + (shape.height - (s.y2 - shape.y));
        }
      } else if ('svgPathData' in shape && shape.svgPathData) {
        if (axis === 'horizontal') {
          update.svgPathData = transformPath(shape.svgPathData, {
            scaleX: -1,
            translateX: shape.width,
          });
        } else {
          update.svgPathData = transformPath(shape.svgPathData, {
            scaleY: -1,
            translateY: shape.height,
          });
        }

        const rec = shape as Record<string, unknown>;
        if (rec.cornerRadiusTL !== undefined) {
          if (axis === 'horizontal') {
            update.cornerRadiusTL = rec.cornerRadiusTR;
            update.cornerRadiusTR = rec.cornerRadiusTL;
            update.cornerRadiusBL = rec.cornerRadiusBR;
            update.cornerRadiusBR = rec.cornerRadiusBL;
          } else {
            update.cornerRadiusTL = rec.cornerRadiusBL;
            update.cornerRadiusTR = rec.cornerRadiusBR;
            update.cornerRadiusBL = rec.cornerRadiusTL;
            update.cornerRadiusBR = rec.cornerRadiusTR;
          }
        }
      }

      if (Object.keys(update).length > 0) {
        updateShape(ydoc, shape.id, update as Partial<Shape>);
      }
    }
  });
}
