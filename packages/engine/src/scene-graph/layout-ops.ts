import type * as Y from 'yjs';
import type { FrameShape, Shape } from '@draftila/shared';
import {
  isAutoLayoutFrame,
  getAutoLayoutConfig,
  computeAutoLayout,
  type LayoutChild,
} from '../auto-layout';
import {
  getShapesMap,
  getShapeSnapshotMap,
  getZOrder,
  getOrderedIds,
  buildChildrenByParent,
  getSiblingIdsForParent,
  getValidParentId,
} from './hierarchy';
import { replaceZOrder, applySiblingOrder } from './z-order';
import { getShape, getChildShapes } from './shape-crud';

type ShapeWithLayout = Shape & {
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};

function toLayoutChild(c: Shape): LayoutChild {
  const s = c as ShapeWithLayout;
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    layoutSizingHorizontal:
      s.layoutSizingHorizontal === 'fill'
        ? 'fill'
        : s.layoutSizingHorizontal === 'hug'
          ? 'hug'
          : 'fixed',
    layoutSizingVertical:
      s.layoutSizingVertical === 'fill'
        ? 'fill'
        : s.layoutSizingVertical === 'hug'
          ? 'hug'
          : 'fixed',
    visible: c.visible,
    minWidth: s.minWidth,
    maxWidth: s.maxWidth,
    minHeight: s.minHeight,
    maxHeight: s.maxHeight,
  };
}

function offsetDescendants(
  shapes: Y.Map<Y.Map<unknown>>,
  childrenByParent: Map<string | null, string[]>,
  parentId: string,
  dx: number,
  dy: number,
) {
  const stack = [...(childrenByParent.get(parentId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const data = shapes.get(id);
    if (!data) continue;
    data.set('x', Math.round((data.get('x') as number) + dx));
    data.set('y', Math.round((data.get('y') as number) + dy));
    const children = childrenByParent.get(id);
    if (children) {
      for (const childId of children) {
        stack.push(childId);
      }
    }
  }
}

export function applyAutoLayout(ydoc: Y.Doc, frameId: string) {
  const frameShape = getShape(ydoc, frameId);
  if (!frameShape || !isAutoLayoutFrame(frameShape)) return;

  const children = getChildShapes(ydoc, frameId);
  const layoutChildren: LayoutChild[] = children.map(toLayoutChild);

  const { childLayouts, parentSize } = computeAutoLayout(frameShape as FrameShape, layoutChildren);

  const shapes = getShapesMap(ydoc);
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);

  ydoc.transact(() => {
    const frameData = shapes.get(frameId);
    if (frameData) {
      const frame = frameShape as FrameShape;
      const hugW = Math.round(parentSize.width);
      const hugH = Math.round(parentSize.height);
      if (
        (frame.layoutSizingHorizontal === 'hug' && hugW !== frame.width) ||
        (frame.layoutSizingVertical === 'hug' && hugH !== frame.height)
      ) {
        if (frame.layoutSizingHorizontal === 'hug') frameData.set('width', hugW);
        if (frame.layoutSizingVertical === 'hug') frameData.set('height', hugH);
      }
    }

    const frameX = frameShape.x;
    const frameY = frameShape.y;
    for (const [childId, layout] of childLayouts) {
      const childData = shapes.get(childId);
      if (!childData) continue;
      const currentX = childData.get('x') as number;
      const currentY = childData.get('y') as number;
      const currentW = childData.get('width') as number;
      const currentH = childData.get('height') as number;

      const absoluteX = Math.round(frameX + layout.x);
      const absoluteY = Math.round(frameY + layout.y);
      const newW = Math.round(layout.width);
      const newH = Math.round(layout.height);

      const dx = absoluteX - currentX;
      const dy = absoluteY - currentY;

      if (dx !== 0) childData.set('x', absoluteX);
      if (dy !== 0) childData.set('y', absoluteY);
      if (currentW !== newW) childData.set('width', newW);
      if (currentH !== newH) childData.set('height', newH);

      if (dx !== 0 || dy !== 0) {
        offsetDescendants(shapes, childrenByParent, childId, dx, dy);
      }
    }
  });
}

export function applyAutoLayoutForAncestors(ydoc: Y.Doc, shapeId: string) {
  const shape = getShape(ydoc, shapeId);
  if (!shape) return;

  let parentId = shape.parentId ?? null;
  while (parentId) {
    const parent = getShape(ydoc, parentId);
    if (!parent) break;
    if (isAutoLayoutFrame(parent)) {
      applyAutoLayout(ydoc, parentId);
    }
    parentId = parent.parentId ?? null;
  }
}

export function reorderAutoLayoutChildren(
  ydoc: Y.Doc,
  movedIds: string[],
  dragOffset: { dx: number; dy: number },
): void {
  if (movedIds.length === 0) return;

  const shapeMap = getShapeSnapshotMap(ydoc);
  const firstShape = shapeMap.get(movedIds[0]!);
  if (!firstShape) return;

  const parentId = getValidParentId(shapeMap, firstShape.parentId ?? null);
  if (!parentId) return;

  const parent = getShape(ydoc, parentId);
  if (!parent || !isAutoLayoutFrame(parent)) return;

  const config = getAutoLayoutConfig(parent as FrameShape);
  const isHorizontal = config.direction === 'horizontal';

  const movedSet = new Set(movedIds);

  const zOrder = getZOrder(ydoc);
  const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
  const siblingIds = getSiblingIdsForParent(parentId, shapeMap, orderedIds);

  const staticSiblings = siblingIds.filter((id) => !movedSet.has(id));
  if (staticSiblings.length === 0) return;

  const movedCenter = computeGroupCenter(shapeMap, movedIds, dragOffset);
  if (!movedCenter) return;

  const insertIndex = findInsertIndex(shapeMap, staticSiblings, movedCenter, isHorizontal);

  const movedOrdered = siblingIds.filter((id) => movedSet.has(id));
  const newSiblingOrder = [
    ...staticSiblings.slice(0, insertIndex),
    ...movedOrdered,
    ...staticSiblings.slice(insertIndex),
  ];

  const nextOrder = applySiblingOrder(orderedIds, siblingIds, newSiblingOrder);
  replaceZOrder(zOrder, nextOrder);
}

export function computeAutoLayoutPreview(
  ydoc: Y.Doc,
  movedIds: string[],
  dragOffset: { dx: number; dy: number },
): Map<string, { x: number; y: number }> | null {
  if (movedIds.length === 0) return null;

  const shapeMap = getShapeSnapshotMap(ydoc);
  const firstShape = shapeMap.get(movedIds[0]!);
  if (!firstShape) return null;

  const parentId = getValidParentId(shapeMap, firstShape.parentId ?? null);
  if (!parentId) return null;

  const parent = shapeMap.get(parentId);
  if (!parent || !isAutoLayoutFrame(parent)) return null;

  const frame = parent as FrameShape;
  const config = getAutoLayoutConfig(frame);
  const isHorizontal = config.direction === 'horizontal';

  const movedSet = new Set(movedIds);

  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);
  const siblingIds = getSiblingIdsForParent(parentId, shapeMap, orderedIds);

  const staticSiblings = siblingIds.filter((id) => !movedSet.has(id));
  if (staticSiblings.length === 0) return null;

  const movedCenter = computeGroupCenter(shapeMap, movedIds, dragOffset);
  if (!movedCenter) return null;

  const insertIndex = findInsertIndex(shapeMap, staticSiblings, movedCenter, isHorizontal);

  const movedOrdered = siblingIds.filter((id) => movedSet.has(id));
  const reorderedIds = [
    ...staticSiblings.slice(0, insertIndex),
    ...movedOrdered,
    ...staticSiblings.slice(insertIndex),
  ];

  const isSameOrder = reorderedIds.every((id, i) => id === siblingIds[i]);
  if (isSameOrder) return null;

  const layoutChildren: LayoutChild[] = reorderedIds
    .map((id) => shapeMap.get(id))
    .filter((c): c is Shape => !!c && c.visible)
    .map((c) => toLayoutChild(c));

  return buildSiblingPreview(ydoc, frame, layoutChildren, movedSet, shapeMap);
}

export function computeAutoLayoutResizePreview(
  ydoc: Y.Doc,
  shapeOverrides: Map<string, { width: number; height: number }>,
): Map<string, { x: number; y: number }> | null {
  if (shapeOverrides.size === 0) return null;

  const shapeMap = getShapeSnapshotMap(ydoc);
  const firstId = shapeOverrides.keys().next().value as string;
  const firstShape = shapeMap.get(firstId);
  if (!firstShape) return null;

  const parentId = getValidParentId(shapeMap, firstShape.parentId ?? null);
  if (!parentId) return null;

  const parent = shapeMap.get(parentId);
  if (!parent || !isAutoLayoutFrame(parent)) return null;

  const frame = parent as FrameShape;

  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);
  const siblingIds = getSiblingIdsForParent(parentId, shapeMap, orderedIds);

  const affectedSet = new Set(shapeOverrides.keys());

  const layoutChildren: LayoutChild[] = siblingIds
    .map((id) => shapeMap.get(id))
    .filter((c): c is Shape => !!c && c.visible)
    .map((c) => {
      const child = toLayoutChild(c);
      const override = shapeOverrides.get(c.id);
      if (override) {
        child.width = override.width;
        child.height = override.height;
      }
      return child;
    });

  return buildSiblingPreview(ydoc, frame, layoutChildren, affectedSet, shapeMap);
}

function buildSiblingPreview(
  ydoc: Y.Doc,
  frame: FrameShape,
  layoutChildren: LayoutChild[],
  excludeFromResult: Set<string>,
  shapeMap: Map<string, Shape>,
): Map<string, { x: number; y: number }> | null {
  const { childLayouts } = computeAutoLayout(frame, layoutChildren);

  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);

  const result = new Map<string, { x: number; y: number }>();
  for (const [childId, layout] of childLayouts) {
    if (excludeFromResult.has(childId)) continue;

    const absoluteX = Math.round(frame.x + layout.x);
    const absoluteY = Math.round(frame.y + layout.y);
    const current = shapeMap.get(childId);
    if (!current) continue;

    const dx = absoluteX - current.x;
    const dy = absoluteY - current.y;
    if (dx === 0 && dy === 0) continue;

    result.set(childId, { x: absoluteX, y: absoluteY });
    collectDescendantOffsets(childrenByParent, shapeMap, childId, dx, dy, result);
  }

  return result.size > 0 ? result : null;
}

function collectDescendantOffsets(
  childrenByParent: Map<string | null, string[]>,
  shapeMap: Map<string, Shape>,
  parentId: string,
  dx: number,
  dy: number,
  result: Map<string, { x: number; y: number }>,
) {
  const stack = [...(childrenByParent.get(parentId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const shape = shapeMap.get(id);
    if (!shape) continue;
    result.set(id, { x: shape.x + dx, y: shape.y + dy });
    const children = childrenByParent.get(id);
    if (children) {
      for (const childId of children) {
        stack.push(childId);
      }
    }
  }
}

function findInsertIndex(
  shapeMap: Map<string, Shape>,
  staticSiblings: string[],
  movedCenter: { x: number; y: number },
  isHorizontal: boolean,
): number {
  let insertIndex = staticSiblings.length;
  for (let i = 0; i < staticSiblings.length; i++) {
    const siblingId = staticSiblings[i]!;
    const sibling = shapeMap.get(siblingId);
    if (!sibling) continue;
    const siblingMid = isHorizontal
      ? sibling.x + sibling.width / 2
      : sibling.y + sibling.height / 2;
    const movedPos = isHorizontal ? movedCenter.x : movedCenter.y;
    if (movedPos < siblingMid) {
      insertIndex = i;
      break;
    }
  }
  return insertIndex;
}

function computeGroupCenter(
  shapeMap: Map<string, Shape>,
  ids: string[],
  offset: { dx: number; dy: number },
): { x: number; y: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of ids) {
    const shape = shapeMap.get(id);
    if (!shape) continue;
    minX = Math.min(minX, shape.x + offset.dx);
    minY = Math.min(minY, shape.y + offset.dy);
    maxX = Math.max(maxX, shape.x + offset.dx + shape.width);
    maxY = Math.max(maxY, shape.y + offset.dy + shape.height);
  }

  if (!isFinite(minX)) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
