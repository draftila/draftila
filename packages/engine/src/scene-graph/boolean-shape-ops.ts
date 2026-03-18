import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  type BooleanOperation,
  computePathBoolean,
  isBooleanCompatibleShape,
} from '../boolean-ops';
import { getShapeSnapshotMap } from './hierarchy';
import { addShape, deleteShapes } from './shape-crud';

export function canApplyBooleanOperation(ydoc: Y.Doc, ids: string[]): boolean {
  if (ids.length < 2) return false;
  const shapeMap = getShapeSnapshotMap(ydoc);
  const selectedShapes = ids
    .map((id) => shapeMap.get(id))
    .filter((shape): shape is Shape => Boolean(shape));
  if (selectedShapes.length < 2) return false;
  return selectedShapes.every((shape) => isBooleanCompatibleShape(shape));
}

export function applyBooleanOperation(
  ydoc: Y.Doc,
  ids: string[],
  operation: BooleanOperation,
): string | null {
  if (ids.length < 2) return null;

  const shapeMap = getShapeSnapshotMap(ydoc);
  const selectedShapes = ids
    .map((id) => shapeMap.get(id))
    .filter((shape): shape is Shape => Boolean(shape));

  if (
    selectedShapes.length < 2 ||
    selectedShapes.some((shape) => !isBooleanCompatibleShape(shape))
  ) {
    return null;
  }

  const result = computePathBoolean(selectedShapes, operation);
  if (!result) return null;

  const baseShape = selectedShapes[0]!;
  const styleSource = baseShape as Record<string, unknown>;
  const sharedParentId = selectedShapes.every((shape) => shape.parentId === baseShape.parentId)
    ? baseShape.parentId
    : null;

  let newShapeId: string | null = null;

  ydoc.transact(() => {
    newShapeId = addShape(ydoc, 'path', {
      name: operation,
      parentId: sharedParentId,
      x: result.bounds.x,
      y: result.bounds.y,
      width: Math.max(1, result.bounds.width),
      height: Math.max(1, result.bounds.height),
      svgPathData: result.svgPathData,
      fillRule: result.fillRule,
      fills: styleSource['fills'],
      strokes: styleSource['strokes'],
      shadows: styleSource['shadows'],
      blurs: styleSource['blurs'],
      opacity: baseShape.opacity,
      blendMode: styleSource['blendMode'],
    } as Partial<Shape>);

    deleteShapes(ydoc, ids);
  });

  return newShapeId;
}
