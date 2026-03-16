import * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';

const ID_SIZE = 21;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_SIZE));
  let id = '';
  for (let i = 0; i < ID_SIZE; i++) {
    id += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return id;
}

const ARRAY_OF_OBJECTS_KEYS = new Set(['points', 'fills', 'strokes', 'shadows', 'blurs', 'guides']);

export interface LayerTreeNode {
  shape: Shape;
  children: LayerTreeNode[];
}

export type StackMoveDirection = 'forward' | 'backward' | 'front' | 'back';
export type LayerDropPlacement = 'before' | 'after' | 'inside';

function valueToYjs(key: string, value: unknown): unknown {
  if (ARRAY_OF_OBJECTS_KEYS.has(key) && Array.isArray(value)) {
    const yArray = new Y.Array();
    for (const item of value) {
      const yMap = new Y.Map();
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        yMap.set(k, v);
      }
      yArray.push([yMap]);
    }
    return yArray;
  }
  return value;
}

const SHAPE_DEFAULTS: Record<ShapeType, Omit<Record<string, unknown>, 'id' | 'type'>> = {
  rectangle: {
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    cornerRadius: 0,
    cornerSmoothing: 0,
    shadows: [],
    blurs: [],
  },
  ellipse: {
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  frame: {
    fills: [{ color: '#FFFFFF', opacity: 1, visible: true }],
    strokes: [],
    clip: true,
    shadows: [],
    blurs: [],
    guides: [],
  },
  text: {
    content: '',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: 1.2,
    letterSpacing: 0,
    textDecoration: 'none',
    textTransform: 'none',
    fills: [{ color: '#000000', opacity: 1, visible: true }],
    shadows: [],
    blurs: [],
  },
  path: {
    points: [],
    fills: [{ color: '#000000', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  line: {
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    strokes: [{ color: '#000000', width: 2, opacity: 1, visible: true }],
    shadows: [],
    blurs: [],
  },
  polygon: {
    sides: 6,
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  star: {
    points: 5,
    innerRadius: 0.38,
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  arrow: {
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    strokes: [{ color: '#000000', width: 2, opacity: 1, visible: true }],
    startArrowhead: false,
    endArrowhead: true,
    shadows: [],
    blurs: [],
  },
  image: {
    src: '',
    fit: 'fill',
    shadows: [],
    blurs: [],
  },
  group: {
    shadows: [],
    blurs: [],
  },
};

const BASE_DEFAULTS = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  parentId: null,
  opacity: 1,
  locked: false,
  visible: true,
  name: '',
};

export function initDocument(ydoc: Y.Doc) {
  ydoc.getMap('shapes');
  ydoc.getArray<string>('zOrder');
  ydoc.getMap('meta');
}

export function getShapesMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('shapes') as Y.Map<Y.Map<unknown>>;
}

export function getZOrder(ydoc: Y.Doc): Y.Array<string> {
  return ydoc.getArray<string>('zOrder');
}

function ymapToObject(ymap: Y.Map<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  ymap.forEach((value, key) => {
    if (value instanceof Y.Map) {
      obj[key] = ymapToObject(value);
    } else if (value instanceof Y.Array) {
      obj[key] = value.toArray().map((item) => {
        if (item instanceof Y.Map) return ymapToObject(item);
        return item;
      });
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

function getShapeSnapshotMap(ydoc: Y.Doc): Map<string, Shape> {
  const shapes = getShapesMap(ydoc);
  const result = new Map<string, Shape>();
  shapes.forEach((shapeData, id) => {
    result.set(id, ymapToObject(shapeData) as Shape);
  });
  return result;
}

function getOrderedIds(shapeMap: Map<string, Shape>, zOrderIds: string[]): string[] {
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

function getValidParentId(shapeMap: Map<string, Shape>, parentId: string | null): string | null {
  if (!parentId) return null;
  if (!shapeMap.has(parentId)) return null;
  return parentId;
}

function buildChildrenByParent(
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

function flattenHierarchy(
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

function getSiblingIdsForParent(
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

function getTopLevelIds(ids: string[], shapeMap: Map<string, Shape>): string[] {
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

function getDescendantsForId(id: string, childrenByParent: Map<string | null, string[]>): string[] {
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

function canContainChildren(shape: Shape): boolean {
  return shape.type === 'group' || shape.type === 'frame';
}

function wouldCreateParentCycle(
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

function replaceZOrder(zOrder: Y.Array<string>, nextOrder: string[]) {
  if (zOrder.length > 0) {
    zOrder.delete(0, zOrder.length);
  }
  if (nextOrder.length > 0) {
    zOrder.push(nextOrder);
  }
}

function reorderSiblingIds(
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

function applySiblingOrder(
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

function pointInsideShape(shape: Shape, px: number, py: number): boolean {
  return (
    px >= shape.x && px <= shape.x + shape.width && py >= shape.y && py <= shape.y + shape.height
  );
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

function getLastDescendantIndex(
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

export function addShape(ydoc: Y.Doc, type: ShapeType, props: Partial<Shape> = {}): string {
  const id = generateId();
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const typeDefaults = SHAPE_DEFAULTS[type] ?? {};

  const shapeData = new Y.Map<unknown>();

  ydoc.transact(() => {
    const merged = {
      ...BASE_DEFAULTS,
      ...typeDefaults,
      ...props,
      id,
      type,
      name: props.name || type,
    };

    for (const [key, value] of Object.entries(merged)) {
      shapeData.set(key, valueToYjs(key, value));
    }

    shapes.set(id, shapeData);

    const parentId = props.parentId ?? null;
    if (parentId) {
      const shapeMap = getShapeSnapshotMap(ydoc);
      const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
      const childrenByParent = buildChildrenByParent(shapeMap, orderedIds);
      const insertAfterIndex = getLastDescendantIndex(parentId, orderedIds, childrenByParent);
      const nextOrder = [
        ...orderedIds.slice(0, insertAfterIndex + 1),
        id,
        ...orderedIds.slice(insertAfterIndex + 1),
      ];
      replaceZOrder(zOrder, nextOrder);
    } else {
      zOrder.push([id]);
    }
  });

  return id;
}

function getShapeBoundingRect(
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

export function updateShape(ydoc: Y.Doc, id: string, props: Partial<Shape>) {
  const shapes = getShapesMap(ydoc);
  const shapeData = shapes.get(id);
  if (!shapeData) return;

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'id' || key === 'type') continue;
      shapeData.set(key, valueToYjs(key, value));
    }
  });
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

export function groupShapes(ydoc: Y.Doc, ids: string[]): string | null {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const orderedIds = getOrderedIds(shapeMap, getZOrder(ydoc).toArray());
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

export function moveShapesInStack(
  ydoc: Y.Doc,
  ids: string[],
  direction: StackMoveDirection,
): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
  const topLevelIds = getTopLevelIds(ids, shapeMap);

  if (topLevelIds.length === 0) return [];

  const selectedByParent = new Map<string | null, Set<string>>();

  for (const id of topLevelIds) {
    const shape = shapeMap.get(id);
    if (!shape) continue;
    const parentId = getValidParentId(shapeMap, shape.parentId ?? null);
    const set = selectedByParent.get(parentId);
    if (set) {
      set.add(id);
    } else {
      selectedByParent.set(parentId, new Set([id]));
    }
  }

  ydoc.transact(() => {
    let nextOrder = [...orderedIds];

    for (const [parentId, selectedSet] of selectedByParent) {
      const siblingIds = getSiblingIdsForParent(parentId, shapeMap, nextOrder);
      if (siblingIds.length <= 1) continue;

      const selectedSiblings = siblingIds.filter((id) => selectedSet.has(id));
      if (selectedSiblings.length === 0 || selectedSiblings.length === siblingIds.length) continue;

      const nextSiblingIds = reorderSiblingIds(siblingIds, selectedSet, direction);
      nextOrder = applySiblingOrder(nextOrder, siblingIds, nextSiblingIds);
    }

    replaceZOrder(zOrder, nextOrder);
  });

  return topLevelIds;
}

export function moveShapesByDrop(
  ydoc: Y.Doc,
  ids: string[],
  targetId: string,
  placement: LayerDropPlacement,
): string[] {
  const shapeMap = getShapeSnapshotMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const orderedIds = getOrderedIds(shapeMap, zOrder.toArray());
  const movingIds = getTopLevelIds(ids, shapeMap);

  if (movingIds.length === 0) return [];

  const targetShape = shapeMap.get(targetId);
  if (!targetShape) return [];

  const movingSet = new Set(movingIds);
  if (movingSet.has(targetId) && placement !== 'inside') return movingIds;

  let nextParentId: string | null;
  let siblingInsertionIndex = 0;

  if (placement === 'inside') {
    if (!canContainChildren(targetShape)) return [];
    nextParentId = targetShape.id;
    const siblingIds = getSiblingIdsForParent(nextParentId, shapeMap, orderedIds).filter(
      (id) => !movingSet.has(id),
    );
    siblingInsertionIndex = siblingIds.length;
  } else {
    nextParentId = getValidParentId(shapeMap, targetShape.parentId ?? null);
    const siblingIds = getSiblingIdsForParent(nextParentId, shapeMap, orderedIds);
    const remainingSiblings = siblingIds.filter((id) => !movingSet.has(id));
    const targetIndex = remainingSiblings.indexOf(targetId);
    if (targetIndex < 0) return [];
    siblingInsertionIndex = placement === 'before' ? targetIndex + 1 : targetIndex;
  }

  if (wouldCreateParentCycle(shapeMap, movingSet, nextParentId)) return [];

  const movingOrdered = orderedIds.filter((id) => movingSet.has(id));
  const remainingOrder = orderedIds.filter((id) => !movingSet.has(id));
  const targetSiblings = getSiblingIdsForParent(nextParentId, shapeMap, remainingOrder);

  let globalInsertionIndex = remainingOrder.length;

  if (targetSiblings.length > 0) {
    if (siblingInsertionIndex <= 0) {
      const firstSiblingId = targetSiblings[0];
      globalInsertionIndex = firstSiblingId ? remainingOrder.indexOf(firstSiblingId) : 0;
    } else if (siblingInsertionIndex >= targetSiblings.length) {
      const lastSiblingId = targetSiblings[targetSiblings.length - 1];
      const lastSiblingIndex = lastSiblingId ? remainingOrder.lastIndexOf(lastSiblingId) : -1;
      globalInsertionIndex = lastSiblingIndex >= 0 ? lastSiblingIndex + 1 : remainingOrder.length;
    } else {
      const siblingIdAtIndex = targetSiblings[siblingInsertionIndex];
      globalInsertionIndex = siblingIdAtIndex
        ? remainingOrder.indexOf(siblingIdAtIndex)
        : remainingOrder.length;
    }
  }

  if (globalInsertionIndex < 0) {
    globalInsertionIndex = remainingOrder.length;
  }

  const nextOrder = [
    ...remainingOrder.slice(0, globalInsertionIndex),
    ...movingOrdered,
    ...remainingOrder.slice(globalInsertionIndex),
  ];

  const shapes = getShapesMap(ydoc);

  ydoc.transact(() => {
    for (const id of movingIds) {
      const shapeData = shapes.get(id);
      if (!shapeData) continue;
      shapeData.set('parentId', nextParentId);
    }
    replaceZOrder(zOrder, nextOrder);
  });

  return movingIds;
}

export function nudgeShapes(ydoc: Y.Doc, ids: string[], dx: number, dy: number) {
  const shapes = getShapesMap(ydoc);
  const movableIds = getExpandedShapeIds(ydoc, ids);

  ydoc.transact(() => {
    for (const id of movableIds) {
      const shapeData = shapes.get(id);
      if (!shapeData) continue;

      const shapeType = shapeData.get('type') as string;

      shapeData.set('x', (shapeData.get('x') as number) + dx);
      shapeData.set('y', (shapeData.get('y') as number) + dy);

      if (shapeType === 'line' || shapeType === 'arrow') {
        shapeData.set('x1', (shapeData.get('x1') as number) + dx);
        shapeData.set('y1', (shapeData.get('y1') as number) + dy);
        shapeData.set('x2', (shapeData.get('x2') as number) + dx);
        shapeData.set('y2', (shapeData.get('y2') as number) + dy);
      }

      if (shapeType === 'path') {
        const points = shapeData.get('points');
        if (points instanceof Y.Array) {
          for (let i = 0; i < points.length; i++) {
            const point = points.get(i);
            if (point instanceof Y.Map) {
              point.set('x', (point.get('x') as number) + dx);
              point.set('y', (point.get('y') as number) + dy);
            }
          }
        }
      }
    }
  });
}

export function getShapeCount(ydoc: Y.Doc): number {
  return getShapesMap(ydoc).size;
}

export type ShapeChangeCallback = (changes: {
  added: string[];
  updated: string[];
  deleted: string[];
}) => void;

export function observeShapes(ydoc: Y.Doc, callback: ShapeChangeCallback): () => void {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);

  const handleShapeMapChange = (events: Y.YEvent<Y.Map<unknown>>[]) => {
    const added: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];

    for (const event of events) {
      if (event.target === shapes) {
        event.changes.keys.forEach((change, key) => {
          if (change.action === 'add') added.push(key);
          else if (change.action === 'delete') deleted.push(key);
          else if (change.action === 'update') updated.push(key);
        });
      } else {
        const id = event.target.get('id') as string | undefined;
        if (id && !updated.includes(id)) {
          updated.push(id);
        }
      }
    }

    if (added.length > 0 || updated.length > 0 || deleted.length > 0) {
      callback({ added, updated, deleted });
    }
  };

  const handleZOrderChange = () => {
    callback({ added: [], updated: zOrder.toArray(), deleted: [] });
  };

  shapes.observeDeep(handleShapeMapChange);
  zOrder.observe(handleZOrderChange);
  return () => {
    shapes.unobserveDeep(handleShapeMapChange);
    zOrder.unobserve(handleZOrderChange);
  };
}
