import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  getShapesMap,
  getZOrder,
  getShapeSnapshotMap,
  getOrderedIds,
  buildChildrenByParent,
  getTopLevelIds,
  getShapeBoundingRect,
  getValidParentId,
} from './hierarchy';
import { replaceZOrder } from './z-order';
import { addShape } from './shape-crud';

export function groupShapes(ydoc: Y.Doc, ids: string[]): string | null {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const topLevelIds = getTopLevelIds(ids, shapeMap);

  if (topLevelIds.length < 2) return null;

  const selectedShapes = topLevelIds
    .map((id) => shapeMap.get(id))
    .filter((shape): shape is Shape => Boolean(shape));

  if (selectedShapes.length < 2) return null;

  const bounds = getShapeBoundingRect(selectedShapes);
  if (!bounds) return null;

  const firstParentId = getValidParentId(shapeMap, selectedShapes[0]?.parentId ?? null);
  const sameParent = selectedShapes.every(
    (shape) => getValidParentId(shapeMap, shape.parentId ?? null) === firstParentId,
  );
  const groupParentId = sameParent ? firstParentId : null;

  const groupId = addShape(ydoc, 'group', {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    parentId: groupParentId,
    name: 'Group',
  });

  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);

  ydoc.transact(() => {
    for (const id of topLevelIds) {
      const shapeData = shapes.get(id);
      if (!shapeData) continue;
      shapeData.set('parentId', groupId);
    }

    const currentOrder = getOrderedIds(getShapeSnapshotMap(ydoc), zOrder.toArray());
    const maxSelectedIndex = Math.max(
      ...topLevelIds.map((id) => currentOrder.indexOf(id)).filter((index) => index >= 0),
    );

    const withoutGroup = currentOrder.filter((id) => id !== groupId);
    const insertionIndex = maxSelectedIndex >= 0 ? maxSelectedIndex : withoutGroup.length;
    withoutGroup.splice(Math.min(insertionIndex, withoutGroup.length), 0, groupId);
    replaceZOrder(zOrder, withoutGroup);
  });

  return groupId;
}

export function ungroupShapes(ydoc: Y.Doc, ids: string[]): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const orderedIds = getOrderedIds(shapeMap, getZOrder(ydoc).toArray());
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);
  const topLevelIds = getTopLevelIds(ids, shapeMap);

  const groupIds = topLevelIds.filter((id) => shapeMap.get(id)?.type === 'group');
  if (groupIds.length === 0) return [];

  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const selectedChildIds: string[] = [];

  ydoc.transact(() => {
    let nextOrder = getOrderedIds(getShapeSnapshotMap(ydoc), zOrder.toArray());

    for (const groupId of groupIds) {
      const group = shapeMap.get(groupId);
      if (!group || group.type !== 'group') continue;

      const groupChildren = childrenByParent.get(groupId) ?? [];
      if (groupChildren.length === 0) {
        shapes.delete(groupId);
        nextOrder = nextOrder.filter((id) => id !== groupId);
        continue;
      }

      const groupParentId = getValidParentId(shapeMap, group.parentId ?? null);

      for (const childId of groupChildren) {
        const childData = shapes.get(childId);
        if (!childData) continue;
        childData.set('parentId', groupParentId);
      }

      const groupIndex = nextOrder.indexOf(groupId);
      const removeSet = new Set<string>([groupId, ...groupChildren]);
      const removedBeforeGroup = nextOrder.reduce((count, id, index) => {
        if (index < groupIndex && removeSet.has(id)) {
          return count + 1;
        }
        return count;
      }, 0);

      const filtered = nextOrder.filter((id) => !removeSet.has(id));

      if (groupIndex >= 0) {
        const insertionIndex = Math.max(0, groupIndex - removedBeforeGroup);
        filtered.splice(Math.min(insertionIndex, filtered.length), 0, ...groupChildren);
      } else {
        filtered.push(...groupChildren);
      }

      shapes.delete(groupId);
      selectedChildIds.push(...groupChildren);
      nextOrder = filtered;
    }

    replaceZOrder(zOrder, nextOrder);
  });

  return selectedChildIds;
}

export function frameSelection(ydoc: Y.Doc, ids: string[]): string | null {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const topLevelIds = getTopLevelIds(ids, shapeMap);
  if (topLevelIds.length === 0) return null;

  const selectedShapes = topLevelIds
    .map((id) => shapeMap.get(id))
    .filter((shape): shape is Shape => Boolean(shape));

  if (selectedShapes.length === 0) return null;

  const bounds = getShapeBoundingRect(selectedShapes);
  if (!bounds) return null;

  const firstParentId = getValidParentId(shapeMap, selectedShapes[0]?.parentId ?? null);
  const sameParent = selectedShapes.every(
    (shape) => getValidParentId(shapeMap, shape.parentId ?? null) === firstParentId,
  );
  const frameParentId = sameParent ? firstParentId : null;

  const frameId = addShape(ydoc, 'frame', {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    parentId: frameParentId,
    name: 'Frame',
  });

  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);

  ydoc.transact(() => {
    for (const id of topLevelIds) {
      const shapeData = shapes.get(id);
      if (!shapeData) continue;
      shapeData.set('parentId', frameId);
    }

    const currentOrder = getOrderedIds(getShapeSnapshotMap(ydoc), zOrder.toArray());
    const maxSelectedIndex = Math.max(
      ...topLevelIds.map((id) => currentOrder.indexOf(id)).filter((index) => index >= 0),
    );

    const withoutFrame = currentOrder.filter((id) => id !== frameId);
    const insertionIndex = maxSelectedIndex >= 0 ? maxSelectedIndex : withoutFrame.length;
    withoutFrame.splice(Math.min(insertionIndex, withoutFrame.length), 0, frameId);
    replaceZOrder(zOrder, withoutFrame);
  });

  return frameId;
}
