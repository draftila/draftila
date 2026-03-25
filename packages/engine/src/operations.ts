import type * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';
import {
  addShape,
  updateShape,
  deleteShapes,
  getShape,
  getAllShapes,
  getChildShapes,
  groupShapes,
  ungroupShapes,
  frameSelection,
  nudgeShapes,
  flipShapes,
  moveShapesInStack,
  moveShapesByDrop,
  applyAutoLayout,
  applyAutoLayoutForAncestors,
  applyBooleanOperation,
} from './scene-graph';
import type { StackMoveDirection, LayerDropPlacement } from './scene-graph/types';
import type { BooleanOperation } from './boolean-ops';
import { isAutoLayoutFrame } from './auto-layout';
import { alignShapes, distributeShapes } from './selection';
import {
  duplicateShapesInPlace,
  pasteShapes,
  cutShapes,
  pasteStyle,
  type PasteOptions,
} from './clipboard';

export function opCreateShape(
  ydoc: Y.Doc,
  type: ShapeType,
  props?: Partial<Shape>,
  childIndex?: number,
): string {
  const id = addShape(ydoc, type, props, childIndex);
  applyAutoLayoutForAncestors(ydoc, id);
  return id;
}

export function opUpdateShape(ydoc: Y.Doc, shapeId: string, props: Partial<Shape>): void {
  const before = getShape(ydoc, shapeId);
  updateShape(ydoc, shapeId, props);

  if (
    before &&
    before.type !== 'frame' &&
    (typeof props.x === 'number' || typeof props.y === 'number')
  ) {
    const after = getShape(ydoc, shapeId);
    if (after) {
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      if (dx !== 0 || dy !== 0) {
        const children = getChildShapes(ydoc, shapeId);
        if (children.length > 0) {
          nudgeShapes(
            ydoc,
            children.map((c) => c.id),
            dx,
            dy,
          );
        }
      }
    }
  }

  const updated = getShape(ydoc, shapeId);
  if (updated && isAutoLayoutFrame(updated)) {
    applyAutoLayout(ydoc, shapeId);
  }
  applyAutoLayoutForAncestors(ydoc, shapeId);
}

export function opBatchUpdateShapes(
  ydoc: Y.Doc,
  updates: Array<{ shapeId: string; props: Partial<Shape> }>,
): void {
  const affectedIds = new Set<string>();

  for (const update of updates) {
    const before = getShape(ydoc, update.shapeId);
    updateShape(ydoc, update.shapeId, update.props);

    if (
      before &&
      before.type !== 'frame' &&
      (typeof update.props.x === 'number' || typeof update.props.y === 'number')
    ) {
      const after = getShape(ydoc, update.shapeId);
      if (after) {
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        if (dx !== 0 || dy !== 0) {
          const children = getChildShapes(ydoc, update.shapeId);
          if (children.length > 0) {
            nudgeShapes(
              ydoc,
              children.map((c) => c.id),
              dx,
              dy,
            );
          }
        }
      }
    }

    affectedIds.add(update.shapeId);
  }

  for (const id of affectedIds) {
    const updated = getShape(ydoc, id);
    if (updated && isAutoLayoutFrame(updated)) {
      applyAutoLayout(ydoc, id);
    }
    applyAutoLayoutForAncestors(ydoc, id);
  }
}

export function opDeleteShapes(ydoc: Y.Doc, shapeIds: string[]): void {
  const parentIds = shapeIds
    .map((id) => getShape(ydoc, id)?.parentId)
    .filter((id): id is string => !!id);
  const uniqueParents = [...new Set(parentIds)];

  deleteShapes(ydoc, shapeIds);

  for (const parentId of uniqueParents) {
    const parent = getShape(ydoc, parentId);
    if (parent && isAutoLayoutFrame(parent)) {
      applyAutoLayout(ydoc, parentId);
    }
    applyAutoLayoutForAncestors(ydoc, parentId);
  }
}

export function opNudgeShapes(ydoc: Y.Doc, shapeIds: string[], dx: number, dy: number): void {
  nudgeShapes(ydoc, shapeIds, dx, dy);
  for (const id of shapeIds) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
}

export function opFlipShapes(
  ydoc: Y.Doc,
  shapeIds: string[],
  axis: 'horizontal' | 'vertical',
): void {
  flipShapes(ydoc, shapeIds, axis);
}

export function opGroupShapes(ydoc: Y.Doc, shapeIds: string[]): string | null {
  const groupId = groupShapes(ydoc, shapeIds);
  if (groupId) {
    applyAutoLayoutForAncestors(ydoc, groupId);
  }
  return groupId;
}

export function opUngroupShapes(ydoc: Y.Doc, shapeIds: string[]): string[] {
  const childIds = ungroupShapes(ydoc, shapeIds);
  for (const id of childIds) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
  return childIds;
}

export function opFrameSelection(ydoc: Y.Doc, shapeIds: string[]): string | null {
  const frameId = frameSelection(ydoc, shapeIds);
  if (frameId) {
    applyAutoLayoutForAncestors(ydoc, frameId);
  }
  return frameId;
}

export function opMoveInStack(
  ydoc: Y.Doc,
  shapeIds: string[],
  direction: StackMoveDirection,
): string[] {
  return moveShapesInStack(ydoc, shapeIds, direction);
}

export function opMoveByDrop(
  ydoc: Y.Doc,
  shapeIds: string[],
  targetId: string,
  placement: LayerDropPlacement,
): string[] {
  const movedIds = moveShapesByDrop(ydoc, shapeIds, targetId, placement);
  for (const id of movedIds) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
  return movedIds;
}

export function opAlignShapes(
  ydoc: Y.Doc,
  shapeIds: string[],
  alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom',
): void {
  const allShapes = getAllShapes(ydoc);
  const shapeSet = new Set(shapeIds);
  const shapes = allShapes.filter((s) => shapeSet.has(s.id));
  const updates = alignShapes(shapes, alignment);
  for (const [id, pos] of updates) {
    updateShape(ydoc, id, pos as Partial<Shape>);
  }
  for (const [id] of updates) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
}

export function opDistributeShapes(
  ydoc: Y.Doc,
  shapeIds: string[],
  direction: 'horizontal' | 'vertical',
): void {
  const allShapes = getAllShapes(ydoc);
  const shapeSet = new Set(shapeIds);
  const shapes = allShapes.filter((s) => shapeSet.has(s.id));
  const updates = distributeShapes(shapes, direction);
  for (const [id, pos] of updates) {
    updateShape(ydoc, id, pos as Partial<Shape>);
  }
  for (const [id] of updates) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
}

export function opBooleanOperation(
  ydoc: Y.Doc,
  shapeIds: string[],
  operation: BooleanOperation,
): string | null {
  const resultId = applyBooleanOperation(ydoc, shapeIds, operation);
  if (resultId) {
    applyAutoLayoutForAncestors(ydoc, resultId);
  }
  return resultId;
}

export function opDuplicateShapesInPlace(ydoc: Y.Doc, shapeIds: string[]): Map<string, string> {
  const idMap = duplicateShapesInPlace(ydoc, shapeIds);
  for (const newId of idMap.values()) {
    applyAutoLayoutForAncestors(ydoc, newId);
  }
  return idMap;
}

export function opPasteShapes(ydoc: Y.Doc, options?: PasteOptions): string[] {
  const newIds = pasteShapes(ydoc, options);
  for (const id of newIds) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
  return newIds;
}

export function opCutShapes(ydoc: Y.Doc, shapeIds: string[]): Shape[] {
  const parentIds = shapeIds
    .map((id) => getShape(ydoc, id)?.parentId)
    .filter((id): id is string => !!id);
  const uniqueParents = [...new Set(parentIds)];

  const shapes = cutShapes(ydoc, shapeIds);

  for (const parentId of uniqueParents) {
    const parent = getShape(ydoc, parentId);
    if (parent && isAutoLayoutFrame(parent)) {
      applyAutoLayout(ydoc, parentId);
    }
    applyAutoLayoutForAncestors(ydoc, parentId);
  }

  return shapes;
}

export function opPasteStyle(ydoc: Y.Doc, shapeIds: string[]): string[] {
  const updatedIds = pasteStyle(ydoc, shapeIds);
  for (const id of updatedIds) {
    applyAutoLayoutForAncestors(ydoc, id);
  }
  return updatedIds;
}
