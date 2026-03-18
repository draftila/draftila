import type * as Y from 'yjs';
import type { FrameShape, Shape } from '@draftila/shared';
import { isAutoLayoutFrame, computeAutoLayout, type LayoutChild } from '../auto-layout';
import { getShapesMap } from './hierarchy';
import { getShape, getChildShapes } from './shape-crud';

export function applyAutoLayout(ydoc: Y.Doc, frameId: string) {
  const frameShape = getShape(ydoc, frameId);
  if (!frameShape || !isAutoLayoutFrame(frameShape)) return;

  const children = getChildShapes(ydoc, frameId);
  const layoutChildren: LayoutChild[] = children.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    layoutSizingHorizontal:
      (c as Shape & { layoutSizingHorizontal?: string }).layoutSizingHorizontal === 'fill'
        ? 'fill'
        : (c as Shape & { layoutSizingHorizontal?: string }).layoutSizingHorizontal === 'hug'
          ? 'hug'
          : 'fixed',
    layoutSizingVertical:
      (c as Shape & { layoutSizingVertical?: string }).layoutSizingVertical === 'fill'
        ? 'fill'
        : (c as Shape & { layoutSizingVertical?: string }).layoutSizingVertical === 'hug'
          ? 'hug'
          : 'fixed',
    visible: c.visible,
  }));

  const { childLayouts, parentSize } = computeAutoLayout(frameShape as FrameShape, layoutChildren);

  const shapes = getShapesMap(ydoc);

  ydoc.transact(() => {
    const frameData = shapes.get(frameId);
    if (frameData) {
      const frame = frameShape as FrameShape;
      if (
        (frame.layoutSizingHorizontal === 'hug' && parentSize.width !== frame.width) ||
        (frame.layoutSizingVertical === 'hug' && parentSize.height !== frame.height)
      ) {
        if (frame.layoutSizingHorizontal === 'hug') frameData.set('width', parentSize.width);
        if (frame.layoutSizingVertical === 'hug') frameData.set('height', parentSize.height);
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

      const absoluteX = frameX + layout.x;
      const absoluteY = frameY + layout.y;

      if (currentX !== absoluteX) childData.set('x', absoluteX);
      if (currentY !== absoluteY) childData.set('y', absoluteY);
      if (currentW !== layout.width) childData.set('width', layout.width);
      if (currentH !== layout.height) childData.set('height', layout.height);
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
