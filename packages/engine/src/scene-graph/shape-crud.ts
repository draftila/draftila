import * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';
import { initPages } from '../pages';
import { DEFAULT_CONSTRAINTS, applyConstraints } from '../constraints';
import { applyTextAutoResize } from '../text-measure';
import { valueToYjs, ymapToObject } from './yjs-utils';
import {
  generateId,
  computeSvgPathForShape,
  SHAPE_DEFAULTS,
  BASE_DEFAULTS,
  PATH_AFFECTING_KEYS,
} from './shape-defaults';
import {
  getShapesMap,
  getZOrder,
  getShapeSnapshotMap,
  getOrderedIds,
  buildChildrenByParent,
  flattenHierarchy,
  getTopLevelIds,
  getDescendantsForId,
  getLastDescendantIndex,
  getValidParentId,
} from './hierarchy';
import { replaceZOrder } from './z-order';

export function initDocument(ydoc: Y.Doc) {
  ydoc.getMap('shapes');
  ydoc.getArray<string>('zOrder');
  ydoc.getMap('meta');
  initPages(ydoc);
}

export function getShape(ydoc: Y.Doc, id: string): Shape | null {
  const shapes = getShapesMap(ydoc);
  const shapeData = shapes.get(id);
  if (!shapeData) return null;
  return ymapToObject(shapeData) as Shape;
}

export function getAllShapes(ydoc: Y.Doc): Shape[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);
  return flattenHierarchy(shapeMap, childrenByParent);
}

export function getChildShapes(ydoc: Y.Doc, parentId: string): Shape[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrderIds = getZOrder(ydoc).toArray();
  const orderedIds = getOrderedIds(shapeMap, zOrderIds);

  const children: Shape[] = [];
  for (const id of orderedIds) {
    const shape = shapeMap.get(id);
    if (!shape) continue;
    const pid = getValidParentId(shapeMap, shape.parentId ?? null);
    if (pid === parentId) children.push(shape);
  }
  return children;
}

export function getShapeCount(ydoc: Y.Doc): number {
  return getShapesMap(ydoc).size;
}

export function addShape(
  ydoc: Y.Doc,
  type: ShapeType,
  props: Partial<Shape> = {},
  childIndex?: number,
): string {
  const id = generateId();
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const typeDefaults = SHAPE_DEFAULTS[type] ?? {};

  const shapeData = new Y.Map<unknown>();

  ydoc.transact(() => {
    const merged: Record<string, unknown> = {
      ...BASE_DEFAULTS,
      ...typeDefaults,
      ...props,
      id,
      type,
      name: props.name || type,
    };

    if (!merged['svgPathData']) {
      const pathData = computeSvgPathForShape(type, merged);
      if (pathData) merged['svgPathData'] = pathData;
    }

    for (const [key, value] of Object.entries(merged)) {
      shapeData.set(key, valueToYjs(key, value));
    }

    shapes.set(id, shapeData);

    const parentId = props.parentId ?? null;
    if (parentId) {
      const shapeMap = getShapeSnapshotMap(ydoc);
      const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
      const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);

      if (childIndex !== undefined && childIndex >= 0) {
        const siblings = childrenByParent.get(parentId) ?? [];
        if (childIndex <= siblings.length && siblings.length > 0) {
          const targetSiblingId = childIndex < siblings.length ? siblings[childIndex] : undefined;
          let insertAt: number;
          if (targetSiblingId) {
            insertAt = orderedIds.indexOf(targetSiblingId);
          } else {
            insertAt = getLastDescendantIndex(parentId, orderedIds, childrenByParent) + 1;
          }
          const nextOrder = [...orderedIds.slice(0, insertAt), id, ...orderedIds.slice(insertAt)];
          replaceZOrder(zOrder, nextOrder);
        } else {
          const insertAfterIndex = getLastDescendantIndex(parentId, orderedIds, childrenByParent);
          const nextOrder = [
            ...orderedIds.slice(0, insertAfterIndex + 1),
            id,
            ...orderedIds.slice(insertAfterIndex + 1),
          ];
          replaceZOrder(zOrder, nextOrder);
        }
      } else {
        const insertAfterIndex = getLastDescendantIndex(parentId, orderedIds, childrenByParent);
        const nextOrder = [
          ...orderedIds.slice(0, insertAfterIndex + 1),
          id,
          ...orderedIds.slice(insertAfterIndex + 1),
        ];
        replaceZOrder(zOrder, nextOrder);
      }
    } else {
      zOrder.push([id]);
    }
  });

  return id;
}

export function updateShape(ydoc: Y.Doc, id: string, props: Partial<Shape>) {
  const shapes = getShapesMap(ydoc);
  const shapeData = shapes.get(id);
  if (!shapeData) return;
  const beforeShape = ymapToObject(shapeData) as Shape;

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'id' || key === 'type') continue;
      shapeData.set(key, valueToYjs(key, value));
    }

    const shapeType = shapeData.get('type') as ShapeType | undefined;
    if (!shapeType) return;
    const propsRecord = props as Record<string, unknown>;
    const hasPathAffectingChange =
      !propsRecord['svgPathData'] && Object.keys(props).some((k) => PATH_AFFECTING_KEYS.has(k));

    if (hasPathAffectingChange) {
      const merged: Record<string, unknown> = {};
      for (const [k, v] of shapeData.entries()) {
        merged[k] = v;
      }
      Object.assign(merged, props);
      const newPath = computeSvgPathForShape(shapeType, merged);
      if (newPath) {
        shapeData.set('svgPathData', newPath);
      }
    }
  });

  if (beforeShape.type === 'text') {
    const textKeys = [
      'content',
      'fontSize',
      'fontFamily',
      'fontWeight',
      'fontStyle',
      'lineHeight',
      'letterSpacing',
      'textTransform',
      'textAutoResize',
    ];
    const hasTextChange = Object.keys(props).some((k) => textKeys.includes(k));
    if (hasTextChange) {
      const updatedText = getShape(ydoc, id);
      if (updatedText) {
        const autoResizePatch = applyTextAutoResize(updatedText);
        if (autoResizePatch) {
          const textData = shapes.get(id);
          if (textData) {
            ydoc.transact(() => {
              for (const [key, value] of Object.entries(autoResizePatch)) {
                textData.set(key, valueToYjs(key, value));
              }
            });
          }
        }
      }
    }
  }

  const resizedOrMoved =
    typeof props.width === 'number' ||
    typeof props.height === 'number' ||
    typeof props.x === 'number' ||
    typeof props.y === 'number';

  if (beforeShape.type !== 'frame' || !resizedOrMoved) return;

  const layoutMode = (beforeShape as Shape & { layoutMode?: string }).layoutMode ?? 'none';
  if (layoutMode !== 'none') return;

  const afterShape = getShape(ydoc, id);
  if (!afterShape || afterShape.type !== 'frame') return;

  const children = getChildShapes(ydoc, id);
  for (const child of children) {
    const withConstraints = child as Shape & {
      constraintHorizontal?: 'left' | 'right' | 'left-right' | 'center' | 'scale';
      constraintVertical?: 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale';
    };

    const originalRelative = {
      x: child.x - beforeShape.x,
      y: child.y - beforeShape.y,
      width: child.width,
      height: child.height,
    };

    const constrained = applyConstraints(
      originalRelative,
      {
        horizontal: withConstraints.constraintHorizontal ?? DEFAULT_CONSTRAINTS.horizontal,
        vertical: withConstraints.constraintVertical ?? DEFAULT_CONSTRAINTS.vertical,
      },
      { width: beforeShape.width, height: beforeShape.height },
      { width: afterShape.width, height: afterShape.height },
      originalRelative,
    );

    updateShape(ydoc, child.id, {
      x: afterShape.x + constrained.x,
      y: afterShape.y + constrained.y,
      width: constrained.width,
      height: constrained.height,
    });
  }
}

export function deleteShape(ydoc: Y.Doc, id: string) {
  deleteShapes(ydoc, [id]);
}

export function deleteShapes(ydoc: Y.Doc, ids: string[]) {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const shapeMap = getShapeSnapshotMap(ydoc);
  const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
  const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);
  const topLevelIds = getTopLevelIds(ids, shapeMap);

  const idSet = new Set<string>();
  for (const id of topLevelIds) {
    idSet.add(id);
    const descendants = getDescendantsForId(id, childrenByParent);
    for (const descendantId of descendants) {
      idSet.add(descendantId);
    }
  }

  if (idSet.size === 0) return;

  ydoc.transact(() => {
    for (const id of idSet) {
      shapes.delete(id);
    }
    for (let i = zOrder.length - 1; i >= 0; i--) {
      const currentId = zOrder.get(i);
      if (currentId && idSet.has(currentId)) {
        zOrder.delete(i, 1);
      }
    }
  });
}
