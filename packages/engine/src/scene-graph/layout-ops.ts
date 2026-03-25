import type * as Y from 'yjs';
import type { FrameShape, Shape } from '@draftila/shared';
import { isAutoLayoutFrame, computeAutoLayout, type LayoutChild } from '../auto-layout';
import {
  getShapesMap,
  getShapeSnapshotMap,
  getZOrder,
  getOrderedIds,
  buildChildrenByParent,
} from './hierarchy';
import { getShape, getChildShapes } from './shape-crud';

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
  type ShapeWithLayout = Shape & {
    layoutSizingHorizontal?: string;
    layoutSizingVertical?: string;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  const layoutChildren: LayoutChild[] = children.map((c) => {
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
  });

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
