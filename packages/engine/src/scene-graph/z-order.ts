import * as Y from 'yjs';
import type { StackMoveDirection } from './types';

export function replaceZOrder(zOrder: Y.Array<string>, nextOrder: string[]) {
  if (zOrder.length > 0) {
    zOrder.delete(0, zOrder.length);
  }
  if (nextOrder.length > 0) {
    zOrder.push(nextOrder);
  }
}

export function reorderSiblingIds(
  siblingIds: string[],
  selectedSiblingSet: Set<string>,
  direction: StackMoveDirection,
): string[] {
  if (selectedSiblingSet.size === 0) return siblingIds;

  const siblings = [...siblingIds];

  if (direction === 'front') {
    return [
      ...siblings.filter((id) => !selectedSiblingSet.has(id)),
      ...siblings.filter((id) => selectedSiblingSet.has(id)),
    ];
  }

  if (direction === 'back') {
    return [
      ...siblings.filter((id) => selectedSiblingSet.has(id)),
      ...siblings.filter((id) => !selectedSiblingSet.has(id)),
    ];
  }

  if (direction === 'forward') {
    for (let i = siblings.length - 2; i >= 0; i--) {
      const current = siblings[i];
      const next = siblings[i + 1];
      if (!current || !next) continue;
      if (selectedSiblingSet.has(current) && !selectedSiblingSet.has(next)) {
        siblings[i] = next;
        siblings[i + 1] = current;
      }
    }
    return siblings;
  }

  for (let i = 1; i < siblings.length; i++) {
    const prev = siblings[i - 1];
    const current = siblings[i];
    if (!prev || !current) continue;
    if (selectedSiblingSet.has(current) && !selectedSiblingSet.has(prev)) {
      siblings[i - 1] = current;
      siblings[i] = prev;
    }
  }

  return siblings;
}

export function applySiblingOrder(
  orderedIds: string[],
  siblingIds: string[],
  nextSiblingIds: string[],
): string[] {
  const siblingSet = new Set(siblingIds);
  const positions: number[] = [];

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id && siblingSet.has(id)) {
      positions.push(i);
    }
  }

  if (positions.length !== nextSiblingIds.length) {
    return orderedIds;
  }

  const nextOrdered = [...orderedIds];
  for (let i = 0; i < positions.length; i++) {
    const targetIndex = positions[i];
    const nextId = nextSiblingIds[i];
    if (targetIndex === undefined || !nextId) continue;
    nextOrdered[targetIndex] = nextId;
  }

  return nextOrdered;
}
