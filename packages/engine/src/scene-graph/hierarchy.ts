import * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getActivePageShapesMap, getActivePageZOrder } from '../pages';
import { ymapToObject } from './yjs-utils';

export function getShapesMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return getActivePageShapesMap(ydoc);
}

export function getZOrder(ydoc: Y.Doc): Y.Array<string> {
  return getActivePageZOrder(ydoc);
}

export function getShapeSnapshotMap(ydoc: Y.Doc): Map<string, Shape> {
  const shapes = getShapesMap(ydoc);
  const result = new Map<string, Shape>();
  shapes.forEach((shapeData, id) => {
    result.set(id, ymapToObject(shapeData) as Shape);
  });
  return result;
}

export function getOrderedIds(shapeMap: Map<string, Shape>, zOrderIds: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of zOrderIds) {
    if (!shapeMap.has(id) || seen.has(id)) continue;
    ordered.push(id);
    seen.add(id);
  }

  for (const id of shapeMap.keys()) {
    if (seen.has(id)) continue;
    ordered.push(id);
    seen.add(id);
  }

  return ordered;
}

export function getValidParentId(
  shapeMap: Map<string, Shape>,
  parentId: string | null,
): string | null {
  if (!parentId) return null;
  if (!shapeMap.has(parentId)) return null;
  return parentId;
}

export function buildChildrenByParent(
  shapeMap: Map<string, Shape>,
  orderedIds: string[],
): Map<string | null, string[]> {
  const childrenByParent = new Map<string | null, string[]>();

  const pushChild = (parentId: string | null, childId: string) => {
    const children = childrenByParent.get(parentId);
    if (children) {
      children.push(childId);
      return;
    }
    childrenByParent.set(parentId, [childId]);
  };

  for (const id of orderedIds) {
    const shape = shapeMap.get(id);
    if (!shape) continue;
    const parentId = getValidParentId(shapeMap, shape.parentId ?? null);
    pushChild(parentId, id);
  }

  return childrenByParent;
}

export function flattenHierarchy(
  shapeMap: Map<string, Shape>,
  childrenByParent: Map<string | null, string[]>,
): Shape[] {
  const flattened: Shape[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    const shape = shapeMap.get(id);
    if (!shape) return;

    visiting.add(id);
    flattened.push(shape);

    const children = childrenByParent.get(id) ?? [];
    for (const childId of children) {
      visit(childId);
    }

    visiting.delete(id);
    visited.add(id);
  };

  const roots = childrenByParent.get(null) ?? [];
  for (const rootId of roots) {
    visit(rootId);
  }

  for (const id of shapeMap.keys()) {
    visit(id);
  }

  return flattened;
}

export function getSiblingIdsForParent(
  parentId: string | null,
  shapeMap: Map<string, Shape>,
  orderedIds: string[],
): string[] {
  const siblingIds: string[] = [];
  for (const id of orderedIds) {
    const shape = shapeMap.get(id);
    if (!shape) continue;
    const shapeParentId = getValidParentId(shapeMap, shape.parentId ?? null);
    if (shapeParentId === parentId) {
      siblingIds.push(id);
    }
  }
  return siblingIds;
}

export function getTopLevelIds(ids: string[], shapeMap: Map<string, Shape>): string[] {
  const selected = new Set(ids);
  const topLevel: string[] = [];

  for (const id of ids) {
    if (!shapeMap.has(id)) continue;
    let current = shapeMap.get(id)?.parentId ?? null;
    let hasSelectedAncestor = false;

    while (current) {
      if (selected.has(current)) {
        hasSelectedAncestor = true;
        break;
      }
      current = shapeMap.get(current)?.parentId ?? null;
    }

    if (!hasSelectedAncestor) {
      topLevel.push(id);
    }
  }

  return topLevel;
}

export function getDescendantsForId(
  id: string,
  childrenByParent: Map<string | null, string[]>,
): string[] {
  const descendants: string[] = [];
  const stack = [...(childrenByParent.get(id) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    descendants.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return descendants;
}

export function canContainChildren(shape: Shape): boolean {
  return shape.type === 'group' || shape.type === 'frame';
}

export function wouldCreateParentCycle(
  shapeMap: Map<string, Shape>,
  movingIds: Set<string>,
  targetParentId: string | null,
): boolean {
  let current = targetParentId;
  while (current) {
    if (movingIds.has(current)) return true;
    const parent = shapeMap.get(current);
    if (!parent) return false;
    current = parent.parentId ?? null;
  }
  return false;
}

export function getLastDescendantIndex(
  parentId: string,
  orderedIds: string[],
  childrenByParent: Map<string | null, string[]>,
): number {
  let lastIndex = orderedIds.indexOf(parentId);

  const walkDescendants = (id: string) => {
    const children = childrenByParent.get(id) ?? [];
    for (const childId of children) {
      const idx = orderedIds.indexOf(childId);
      if (idx > lastIndex) lastIndex = idx;
      walkDescendants(childId);
    }
  };

  walkDescendants(parentId);
  return lastIndex;
}

export function pointInsideShape(shape: Shape, px: number, py: number): boolean {
  return (
    px >= shape.x && px <= shape.x + shape.width && py >= shape.y && py <= shape.y + shape.height
  );
}

export function getShapeBoundingRect(
  shapes: Shape[],
): { x: number; y: number; width: number; height: number } | null {
  if (shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
