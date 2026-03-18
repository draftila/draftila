import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  getShapeSnapshotMap,
  getZOrder,
  getOrderedIds,
  buildChildrenByParent,
  getTopLevelIds,
  getDescendantsForId,
  canContainChildren,
  pointInsideShape,
} from './hierarchy';
import { getShape } from './shape-crud';
import type { LayerTreeNode } from './types';

export function getLayerTree(ydoc: Y.Doc): LayerTreeNode[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);

  const buildNode = (id: string): LayerTreeNode | null => {
    const shape = shapeMap.get(id);
    if (!shape) return null;

    const children = childrenByParent.get(id) ?? [];
    const childNodes: LayerTreeNode[] = [];
    for (const childId of children) {
      const childNode = buildNode(childId);
      if (childNode) {
        childNodes.push(childNode);
      }
    }

    return { shape, children: childNodes };
  };

  const rootIds = childrenByParent.get(null) ?? [];
  const tree: LayerTreeNode[] = [];
  for (const rootId of rootIds) {
    const node = buildNode(rootId);
    if (node) {
      tree.push(node);
    }
  }

  return tree;
}

export function getTopLevelSelectedShapeIds(ydoc: Y.Doc, ids: string[]): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  return getTopLevelIds(ids, shapeMap);
}

export function getExpandedShapeIds(ydoc: Y.Doc, ids: string[]): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const orderedIds = getOrderedIds(shapeMap, getZOrder(ydoc).toArray());
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);
  const topLevelIds = getTopLevelIds(ids, shapeMap);

  const expanded: string[] = [];
  for (const id of topLevelIds) {
    expanded.push(id);
    const descendants = getDescendantsForId(id, childrenByParent);
    for (const descendantId of descendants) {
      expanded.push(descendantId);
    }
  }

  return expanded;
}

export function getDescendantShapeIds(ydoc: Y.Doc, id: string): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const orderedIds = getOrderedIds(shapeMap, getZOrder(ydoc).toArray());
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);
  return getDescendantsForId(id, childrenByParent);
}

export function resolveGroupTarget(
  ydoc: Y.Doc,
  shapeId: string,
  enteredGroupId: string | null,
): string {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const ancestors: string[] = [];
  let current = shapeMap.get(shapeId)?.parentId ?? null;
  while (current) {
    const parent = shapeMap.get(current);
    if (!parent) break;
    if (parent.type === 'group') {
      ancestors.push(current);
    }
    current = parent.parentId ?? null;
  }

  if (ancestors.length === 0) return shapeId;

  if (!enteredGroupId) return ancestors[ancestors.length - 1]!;

  const enteredIdx = ancestors.indexOf(enteredGroupId);
  if (enteredIdx < 0) return ancestors[ancestors.length - 1]!;

  if (enteredIdx === 0) return shapeId;

  return ancestors[enteredIdx - 1]!;
}

export function findContainerAtPoint(
  ydoc: Y.Doc,
  px: number,
  py: number,
  excludeIds?: Set<string>,
): string | null {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const orderedIds = getOrderedIds(shapeMap, getZOrder(ydoc).toArray());
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);

  const findDeepest = (parentId: string | null): string | null => {
    const children = childrenByParent.get(parentId) ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      const childId = children[i];
      if (!childId) continue;
      if (excludeIds?.has(childId)) continue;
      const child = shapeMap.get(childId);
      if (!child || !child.visible || child.locked) continue;
      if (!canContainChildren(child)) continue;
      if (!pointInsideShape(child, px, py)) continue;
      const deeper = findDeepest(childId);
      return deeper ?? childId;
    }
    return null;
  };

  return findDeepest(null);
}

export function getSelectedContainer(ydoc: Y.Doc, selectedIds: string[]): string | null {
  if (selectedIds.length !== 1) return null;
  const selectedId = selectedIds[0];
  if (!selectedId) return null;
  const shape = getShape(ydoc, selectedId);
  if (!shape) return null;
  if (canContainChildren(shape)) return selectedId;
  return shape.parentId ?? null;
}
