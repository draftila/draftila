import * as Y from 'yjs';
import type { McpCanvasOp, Shape } from '@draftila/shared';
import {
  addShape,
  deleteShapes,
  getAllShapes,
  getShape,
  getShapesMap,
  groupShapes,
  moveShapesInStack,
  moveShapesByDrop,
  ungroupShapes,
  updateShape,
  applyAutoLayout,
} from '@draftila/engine/scene-graph';
import { isAutoLayoutFrame } from '@draftila/engine/auto-layout';
import * as collaborationService from '../collaboration/collaboration.service';
import * as draftsService from '../drafts/drafts.service';

interface ApplyOpsResult {
  appliedCount: number;
  createdShapeIds: string[];
  createdRefs: Record<string, string>;
  groupedShapeIds: string[];
  ungroupedShapeIds: string[];
  shapeCount: number;
}

interface FindShapesOptions {
  nameContains?: string;
  type?: Shape['type'];
  parentId?: string | null;
  limit: number;
}

function resolveIdToken(id: string, refs: Map<string, string>) {
  if (!id.startsWith('@')) {
    return id;
  }

  const resolved = refs.get(id.slice(1));
  return resolved ?? null;
}

function resolveShapePropsWithRefs(
  props: Record<string, unknown> | undefined,
  refs: Map<string, string>,
) {
  if (!props) {
    return props;
  }

  const rawParentId = props.parentId;
  if (typeof rawParentId !== 'string') {
    return props;
  }

  const resolvedParentId = resolveIdToken(rawParentId, refs);
  if (!resolvedParentId) {
    return props;
  }

  return {
    ...props,
    parentId: resolvedParentId,
  };
}

function getTopLevelIds(ids: string[], shapesById: Map<string, Shape>) {
  const idSet = new Set(ids.filter((id) => shapesById.has(id)));
  const topLevelIds: string[] = [];

  for (const id of ids) {
    if (!idSet.has(id)) {
      continue;
    }

    let currentParentId = shapesById.get(id)?.parentId ?? null;
    let hasSelectedAncestor = false;

    while (currentParentId) {
      if (idSet.has(currentParentId)) {
        hasSelectedAncestor = true;
        break;
      }
      currentParentId = shapesById.get(currentParentId)?.parentId ?? null;
    }

    if (!hasSelectedAncestor) {
      topLevelIds.push(id);
    }
  }

  return topLevelIds;
}

function duplicateShapes(
  ydoc: Y.Doc,
  ids: string[],
  offset: { x: number; y: number },
  refs: Map<string, string>,
  requestedRefs?: string[],
) {
  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((shape) => [shape.id, shape]));
  const rootIds = getTopLevelIds(ids, shapesById);
  if (rootIds.length === 0) {
    return [] as string[];
  }

  const rootIdSet = new Set(rootIds);
  const duplicateIdSet = new Set<string>();

  for (const shape of allShapes) {
    let cursor: string | null = shape.id;
    while (cursor) {
      if (rootIdSet.has(cursor)) {
        duplicateIdSet.add(shape.id);
        break;
      }
      cursor = shapesById.get(cursor)?.parentId ?? null;
    }
  }

  const oldToNewIds = new Map<string, string>();
  const newRootIds: string[] = [];

  for (const shape of allShapes) {
    if (!duplicateIdSet.has(shape.id)) {
      continue;
    }

    const isRoot = rootIdSet.has(shape.id);
    const nextParentId = isRoot ? shape.parentId : (oldToNewIds.get(shape.parentId ?? '') ?? null);
    const { id: _id, ...rest } = shape;

    const newId = addShape(ydoc, shape.type, {
      ...rest,
      parentId: nextParentId,
      x: shape.x + offset.x,
      y: shape.y + offset.y,
    });

    oldToNewIds.set(shape.id, newId);
    if (isRoot) {
      newRootIds.push(newId);
    }
  }

  if (requestedRefs) {
    for (const [index, refName] of requestedRefs.entries()) {
      const newId = newRootIds[index];
      if (!newId) {
        continue;
      }
      refs.set(refName, newId);
    }
  }

  return newRootIds;
}

async function loadDraftDoc(draftId: string) {
  const ydoc = new Y.Doc();
  const state = await draftsService.loadYjsState(draftId);
  if (state) {
    Y.applyUpdate(ydoc, new Uint8Array(state));
  }
  return ydoc;
}

async function saveDraftDoc(draftId: string, ydoc: Y.Doc) {
  const nextState = Buffer.from(Y.encodeStateAsUpdate(ydoc));
  await draftsService.saveYjsState(draftId, nextState);
}

function applyOpsToDoc(ydoc: Y.Doc, ops: McpCanvasOp[]): ApplyOpsResult {
  const createdShapeIds: string[] = [];
  const createdRefs = new Map<string, string>();
  const groupedShapeIds: string[] = [];
  const ungroupedShapeIds: string[] = [];

  ydoc.transact(() => {
    for (const op of ops) {
      if (op.type === 'add_shape') {
        const resolvedProps = resolveShapePropsWithRefs(op.props, createdRefs);
        const createdId = addShape(ydoc, op.shapeType, (resolvedProps ?? {}) as Partial<Shape>);
        createdShapeIds.push(createdId);
        if (op.ref) {
          createdRefs.set(op.ref, createdId);
        }
        continue;
      }

      if (op.type === 'update_shape') {
        const resolvedId = resolveIdToken(op.id, createdRefs);
        if (!resolvedId) {
          continue;
        }
        const resolvedProps = resolveShapePropsWithRefs(op.props, createdRefs);
        updateShape(ydoc, resolvedId, resolvedProps as Partial<Shape>);
        continue;
      }

      if (op.type === 'delete_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) {
          continue;
        }
        deleteShapes(ydoc, ids);
        continue;
      }

      if (op.type === 'move_stack') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) {
          continue;
        }
        moveShapesInStack(ydoc, ids, op.direction);
        continue;
      }

      if (op.type === 'group_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length < 2) {
          continue;
        }
        const groupId = groupShapes(ydoc, ids);
        if (groupId) {
          groupedShapeIds.push(groupId);
        }
        continue;
      }

      if (op.type === 'ungroup_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) {
          continue;
        }
        const childIds = ungroupShapes(ydoc, ids);
        ungroupedShapeIds.push(...childIds);
      }

      if (op.type === 'duplicate_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) {
          continue;
        }

        duplicateShapes(
          ydoc,
          ids,
          {
            x: op.offset?.x ?? 20,
            y: op.offset?.y ?? 20,
          },
          createdRefs,
          op.refs,
        );
      }
    }
  });

  const allAutoLayoutFrameIds = new Set<string>();
  const allShapes = getAllShapes(ydoc);
  for (const shape of allShapes) {
    if (isAutoLayoutFrame(shape)) {
      allAutoLayoutFrameIds.add(shape.id);
    }
  }

  if (allAutoLayoutFrameIds.size > 0) {
    const depthMap = new Map<string, number>();
    const shapeMap = new Map(allShapes.map((s) => [s.id, s]));
    for (const id of allAutoLayoutFrameIds) {
      let depth = 0;
      let current = shapeMap.get(id)?.parentId ?? null;
      while (current) {
        depth++;
        current = shapeMap.get(current)?.parentId ?? null;
      }
      depthMap.set(id, depth);
    }

    const sorted = [...allAutoLayoutFrameIds].sort(
      (a, b) => (depthMap.get(a) ?? 0) - (depthMap.get(b) ?? 0),
    );

    for (const frameId of sorted) {
      applyAutoLayout(ydoc, frameId);
    }
  }

  return {
    appliedCount: ops.length,
    createdShapeIds,
    createdRefs: Object.fromEntries(createdRefs),
    groupedShapeIds,
    ungroupedShapeIds,
    shapeCount: getAllShapes(ydoc).length,
  };
}

async function withDraftDoc<T>(draftId: string, write: boolean, callback: (ydoc: Y.Doc) => T) {
  const liveDoc = collaborationService.getRoomYDoc(draftId);
  if (liveDoc) {
    const result = callback(liveDoc);
    if (write) {
      await saveDraftDoc(draftId, liveDoc);
    }
    return result;
  }

  const ydoc = await loadDraftDoc(draftId);
  try {
    const result = callback(ydoc);
    if (write) {
      await saveDraftDoc(draftId, ydoc);
    }
    return result;
  } finally {
    ydoc.destroy();
  }
}

function summarizeShape(shape: Shape): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: shape.id,
    name: shape.name,
    type: shape.type,
    parentId: shape.parentId,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  };
  if (shape.rotation !== 0) base.rotation = shape.rotation;
  if (shape.opacity !== 1) base.opacity = shape.opacity;
  if (!shape.visible) base.visible = false;
  if (shape.locked) base.locked = true;

  const typed = shape as Record<string, unknown>;

  if (shape.type === 'text') {
    base.content = typed.content;
    base.fontSize = typed.fontSize;
    base.fontFamily = typed.fontFamily;
    base.fontWeight = typed.fontWeight;
    if (typed.fontStyle !== 'normal') base.fontStyle = typed.fontStyle;
    if (typed.textAlign !== 'left') base.textAlign = typed.textAlign;
    if (typed.segments) base.segments = typed.segments;
  }

  if (typed.fills && Array.isArray(typed.fills) && (typed.fills as unknown[]).length > 0) {
    base.fills = typed.fills;
  }
  if (typed.strokes && Array.isArray(typed.strokes) && (typed.strokes as unknown[]).length > 0) {
    base.strokes = typed.strokes;
  }

  if (shape.type === 'frame') {
    const frame = shape as Shape & {
      layoutMode?: string;
      layoutGap?: number;
      layoutAlign?: string;
      layoutJustify?: string;
      clip?: boolean;
    };
    if (frame.layoutMode && frame.layoutMode !== 'none') {
      base.layoutMode = frame.layoutMode;
      base.layoutGap = frame.layoutGap;
      base.layoutAlign = frame.layoutAlign;
      base.layoutJustify = frame.layoutJustify;
    }
    if (frame.clip === false) base.clip = false;
  }

  if (typed.cornerRadius && (typed.cornerRadius as number) > 0)
    base.cornerRadius = typed.cornerRadius;
  if (typed.svgPathData) base.svgPathData = typed.svgPathData;
  if (shape.type === 'image') base.src = typed.src;

  return base;
}

export async function getCanvasSnapshot(
  draftId: string,
  parentId?: string | null,
  maxDepth?: number,
) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const allShapes = getAllShapes(ydoc);
    const effectiveMaxDepth = maxDepth ?? Infinity;

    let filtered: Shape[];
    if (parentId) {
      const shapesById = new Map(allShapes.map((s) => [s.id, s]));
      filtered = allShapes.filter((shape) => {
        if (shape.id === parentId) return true;
        let cursor = shape.parentId;
        let depth = 0;
        while (cursor) {
          depth++;
          if (cursor === parentId) return depth <= effectiveMaxDepth;
          cursor = shapesById.get(cursor)?.parentId ?? null;
        }
        return false;
      });
    } else if (effectiveMaxDepth !== Infinity) {
      const shapesById = new Map(allShapes.map((s) => [s.id, s]));
      filtered = allShapes.filter((shape) => {
        let depth = 0;
        let cursor = shape.parentId;
        while (cursor) {
          depth++;
          cursor = shapesById.get(cursor)?.parentId ?? null;
        }
        return depth <= effectiveMaxDepth;
      });
    } else {
      filtered = allShapes;
    }

    return {
      shapeCount: filtered.length,
      shapes: filtered.map(summarizeShape),
    };
  });
}

export async function getShapeById(draftId: string, shapeId: string) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const shape = getShape(ydoc, shapeId);
    if (!shape) {
      throw new Error('Shape not found');
    }
    return { shape };
  });
}

export async function applyCanvasOps(draftId: string, ops: McpCanvasOp[]): Promise<ApplyOpsResult> {
  const liveDoc = collaborationService.getRoomYDoc(draftId);
  if (liveDoc) {
    const result = applyOpsToDoc(liveDoc, ops);
    await saveDraftDoc(draftId, liveDoc);
    return result;
  }

  const ydoc = await loadDraftDoc(draftId);
  try {
    const result = applyOpsToDoc(ydoc, ops);
    await saveDraftDoc(draftId, ydoc);

    const syncUpdate = Y.encodeStateAsUpdate(ydoc);
    collaborationService.applyUpdateToRoom(draftId, syncUpdate);

    return result;
  } finally {
    ydoc.destroy();
  }
}

export async function findShapes(draftId: string, options: FindShapesOptions) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const normalizedNameContains = options.nameContains?.trim().toLowerCase();
    const shapes = getAllShapes(ydoc);
    const filtered = shapes.filter((shape) => {
      if (options.type && shape.type !== options.type) {
        return false;
      }
      if (options.parentId !== undefined && shape.parentId !== options.parentId) {
        return false;
      }
      if (normalizedNameContains) {
        const shapeName = shape.name.trim().toLowerCase();
        if (!shapeName.includes(normalizedNameContains)) {
          return false;
        }
      }
      return true;
    });

    const limited = filtered.slice(0, options.limit).map(summarizeShape);

    return {
      data: limited,
      total: filtered.length,
    };
  });
}

interface LayoutNode {
  id: string;
  name: string;
  type: string;
  bounds: { x: number; y: number; width: number; height: number };
  problems?: string[];
  children?: LayoutNode[];
}

function detectProblems(shape: Shape, siblings: Shape[], parentShape: Shape | null): string[] {
  const problems: string[] = [];

  if (parentShape) {
    const parentTyped = parentShape as Shape & { clip?: boolean };
    const isClipping = parentTyped.type === 'frame' && parentTyped.clip !== false;
    if (isClipping) {
      if (
        shape.x < 0 ||
        shape.y < 0 ||
        shape.x + shape.width > parentShape.width ||
        shape.y + shape.height > parentShape.height
      ) {
        problems.push('clipped_by_parent');
      }
    }
  }

  for (const sibling of siblings) {
    if (sibling.id === shape.id) continue;
    if (
      shape.x < sibling.x + sibling.width &&
      shape.x + shape.width > sibling.x &&
      shape.y < sibling.y + sibling.height &&
      shape.y + shape.height > sibling.y
    ) {
      problems.push(`overlaps_with:${sibling.id}`);
    }
  }

  return problems;
}

export async function getLayout(
  draftId: string,
  parentId: string | null,
  maxDepth: number,
  problemsOnly: boolean,
) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const allShapes = getAllShapes(ydoc);
    const shapesById = new Map(allShapes.map((s) => [s.id, s]));
    const childrenByParent = new Map<string | null, Shape[]>();
    for (const shape of allShapes) {
      const pid = shape.parentId ?? null;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid)!.push(shape);
    }

    function buildLayoutNode(shape: Shape, depth: number): LayoutNode | null {
      const parentShape = shape.parentId ? (shapesById.get(shape.parentId) ?? null) : null;
      const siblings = childrenByParent.get(shape.parentId ?? null) ?? [];
      const problems = detectProblems(shape, siblings, parentShape);

      const node: LayoutNode = {
        id: shape.id,
        name: shape.name,
        type: shape.type,
        bounds: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      };

      if (problems.length > 0) node.problems = problems;

      if (depth < maxDepth) {
        const children = childrenByParent.get(shape.id) ?? [];
        if (children.length > 0) {
          const childNodes: LayoutNode[] = [];
          for (const child of children) {
            const childNode = buildLayoutNode(child, depth + 1);
            if (childNode) childNodes.push(childNode);
          }
          if (childNodes.length > 0) node.children = childNodes;
        }
      }

      if (
        problemsOnly &&
        !node.problems?.length &&
        !node.children?.some((c) => c.problems?.length)
      ) {
        return null;
      }

      return node;
    }

    const rootShapes = childrenByParent.get(parentId) ?? [];
    const layoutNodes: LayoutNode[] = [];
    for (const shape of rootShapes) {
      const node = buildLayoutNode(shape, 0);
      if (node) layoutNodes.push(node);
    }

    return { nodes: layoutNodes };
  });
}

export async function moveToParent(draftId: string, ids: string[], parentId: string | null) {
  return withDraftDoc(draftId, true, (ydoc) => {
    const allShapes = getAllShapes(ydoc);
    const shapesById = new Map(allShapes.map((s) => [s.id, s]));

    if (parentId) {
      const parentShape = shapesById.get(parentId);
      if (!parentShape) throw new Error('Parent shape not found');
      if (parentShape.type !== 'frame' && parentShape.type !== 'group') {
        throw new Error('Parent must be a frame or group');
      }
    }

    const validIds = ids.filter((id) => shapesById.has(id));
    if (validIds.length === 0) throw new Error('No valid shapes found');

    for (const id of validIds) {
      let cursor = parentId;
      while (cursor) {
        if (cursor === id) throw new Error('Cannot move a shape into its own descendant');
        cursor = shapesById.get(cursor)?.parentId ?? null;
      }
    }

    if (parentId) {
      moveShapesByDrop(ydoc, validIds, parentId, 'inside');
    } else {
      const shapes = getShapesMap(ydoc);
      ydoc.transact(() => {
        for (const id of validIds) {
          const shapeData = shapes.get(id);
          if (shapeData) {
            shapeData.set('parentId', null);
          }
        }
      });
    }

    return { moved: validIds.length, parentId };
  });
}

export async function searchProperties(
  draftId: string,
  parentIds: string[],
  searchProps: string[],
) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const allShapes = getAllShapes(ydoc);
    const shapesById = new Map(allShapes.map((s) => [s.id, s]));

    function getDescendants(rootId: string): Shape[] {
      const resultShapes: Shape[] = [];
      const rootShape = shapesById.get(rootId);
      if (rootShape) resultShapes.push(rootShape);
      for (const shape of allShapes) {
        if (shape.id === rootId) continue;
        let cursor = shape.parentId;
        while (cursor) {
          if (cursor === rootId) {
            resultShapes.push(shape);
            break;
          }
          cursor = shapesById.get(cursor)?.parentId ?? null;
        }
      }
      return resultShapes;
    }

    const targetShapes = new Map<string, Shape>();
    for (const pid of parentIds) {
      for (const shape of getDescendants(pid)) {
        targetShapes.set(shape.id, shape);
      }
    }

    const propResult: Record<string, unknown[]> = {};

    for (const prop of searchProps) {
      const values = new Set<string>();

      for (const shape of targetShapes.values()) {
        const typed = shape as Record<string, unknown>;

        if (prop === 'fillColor') {
          const fills = typed.fills as Array<{ color: string }> | undefined;
          if (fills) {
            for (const fill of fills) {
              if (fill.color) values.add(fill.color.toLowerCase());
            }
          }
        }

        if (prop === 'textColor' && shape.type === 'text') {
          const fills = typed.fills as Array<{ color: string }> | undefined;
          if (fills) {
            for (const fill of fills) {
              if (fill.color) values.add(fill.color.toLowerCase());
            }
          }
        }

        if (prop === 'strokeColor') {
          const strokes = typed.strokes as Array<{ color: string }> | undefined;
          if (strokes) {
            for (const stroke of strokes) {
              if (stroke.color) values.add(stroke.color.toLowerCase());
            }
          }
        }

        if (prop === 'fontFamily' && shape.type === 'text') {
          const family = typed.fontFamily as string | undefined;
          if (family) values.add(family);
        }

        if (prop === 'fontSize' && shape.type === 'text') {
          const size = typed.fontSize as number | undefined;
          if (size !== undefined) values.add(String(size));
        }

        if (prop === 'fontWeight' && shape.type === 'text') {
          const weight = typed.fontWeight as number | undefined;
          if (weight !== undefined) values.add(String(weight));
        }

        if (prop === 'cornerRadius') {
          const radius = typed.cornerRadius as number | undefined;
          if (radius !== undefined && radius > 0) values.add(String(radius));
        }

        if (prop === 'strokeWidth') {
          const strokes = typed.strokes as Array<{ width: number }> | undefined;
          if (strokes) {
            for (const stroke of strokes) {
              if (stroke.width !== undefined) values.add(String(stroke.width));
            }
          }
        }
      }

      const numericProps = new Set(['fontSize', 'fontWeight', 'cornerRadius', 'strokeWidth']);
      propResult[prop] = numericProps.has(prop)
        ? [...values].map(Number).sort((a, b) => a - b)
        : [...values].sort();
    }

    return { properties: propResult, shapesSearched: targetShapes.size };
  });
}

export async function replaceProperties(
  draftId: string,
  parentIds: string[],
  replacements: Record<string, Array<{ from: unknown; to: unknown }>>,
) {
  return withDraftDoc(draftId, true, (ydoc) => {
    const allShapes = getAllShapes(ydoc);
    const shapesById = new Map(allShapes.map((s) => [s.id, s]));

    function getDescendants(rootId: string): Shape[] {
      const resultShapes: Shape[] = [];
      const rootShape = shapesById.get(rootId);
      if (rootShape) resultShapes.push(rootShape);
      for (const shape of allShapes) {
        if (shape.id === rootId) continue;
        let cursor = shape.parentId;
        while (cursor) {
          if (cursor === rootId) {
            resultShapes.push(shape);
            break;
          }
          cursor = shapesById.get(cursor)?.parentId ?? null;
        }
      }
      return resultShapes;
    }

    const targetShapes = new Map<string, Shape>();
    for (const pid of parentIds) {
      for (const shape of getDescendants(pid)) {
        targetShapes.set(shape.id, shape);
      }
    }

    let totalReplacements = 0;
    const shapes = getShapesMap(ydoc);

    ydoc.transact(() => {
      for (const shape of targetShapes.values()) {
        const shapeData = shapes.get(shape.id);
        if (!shapeData) continue;
        const typed = shape as Record<string, unknown>;

        if (replacements.fillColor) {
          const yFills = shapeData.get('fills') as Y.Array<Y.Map<unknown>> | undefined;
          if (yFills) {
            for (let i = 0; i < yFills.length; i++) {
              const yFill = yFills.get(i);
              const currentColor = yFill.get('color') as string;
              for (const { from, to } of replacements.fillColor) {
                if (currentColor?.toLowerCase() === (from as string).toLowerCase()) {
                  yFill.set('color', to as string);
                  totalReplacements++;
                }
              }
            }
          }
        }

        if (replacements.textColor && shape.type === 'text') {
          const yFills = shapeData.get('fills') as Y.Array<Y.Map<unknown>> | undefined;
          if (yFills) {
            for (let i = 0; i < yFills.length; i++) {
              const yFill = yFills.get(i);
              const currentColor = yFill.get('color') as string;
              for (const { from, to } of replacements.textColor) {
                if (currentColor?.toLowerCase() === (from as string).toLowerCase()) {
                  yFill.set('color', to as string);
                  totalReplacements++;
                }
              }
            }
          }
        }

        if (replacements.strokeColor) {
          const yStrokes = shapeData.get('strokes') as Y.Array<Y.Map<unknown>> | undefined;
          if (yStrokes) {
            for (let i = 0; i < yStrokes.length; i++) {
              const yStroke = yStrokes.get(i);
              const currentColor = yStroke.get('color') as string;
              for (const { from, to } of replacements.strokeColor) {
                if (currentColor?.toLowerCase() === (from as string).toLowerCase()) {
                  yStroke.set('color', to as string);
                  totalReplacements++;
                }
              }
            }
          }
        }

        if (replacements.strokeWidth) {
          const yStrokes = shapeData.get('strokes') as Y.Array<Y.Map<unknown>> | undefined;
          if (yStrokes) {
            for (let i = 0; i < yStrokes.length; i++) {
              const yStroke = yStrokes.get(i);
              const currentWidth = yStroke.get('width') as number;
              for (const { from, to } of replacements.strokeWidth) {
                if (currentWidth === (from as number)) {
                  yStroke.set('width', to as number);
                  totalReplacements++;
                }
              }
            }
          }
        }

        if (replacements.fontFamily && shape.type === 'text') {
          const currentFamily = typed.fontFamily as string;
          for (const { from, to } of replacements.fontFamily) {
            if (currentFamily?.toLowerCase() === (from as string).toLowerCase()) {
              shapeData.set('fontFamily', to as string);
              totalReplacements++;
            }
          }
        }

        if (replacements.fontSize && shape.type === 'text') {
          const currentSize = typed.fontSize as number;
          for (const { from, to } of replacements.fontSize) {
            if (currentSize === (from as number)) {
              shapeData.set('fontSize', to as number);
              totalReplacements++;
            }
          }
        }

        if (replacements.fontWeight && shape.type === 'text') {
          const currentWeight = typed.fontWeight as number;
          for (const { from, to } of replacements.fontWeight) {
            if (currentWeight === (from as number)) {
              shapeData.set('fontWeight', to as number);
              totalReplacements++;
            }
          }
        }

        if (replacements.cornerRadius) {
          const currentRadius = typed.cornerRadius as number | undefined;
          if (currentRadius !== undefined) {
            for (const { from, to } of replacements.cornerRadius) {
              if (currentRadius === (from as number)) {
                shapeData.set('cornerRadius', to as number);
                totalReplacements++;
              }
            }
          }
        }
      }
    });

    return { totalReplacements, shapesChecked: targetShapes.size };
  });
}

interface LayerTreeNodeResult {
  id: string;
  name: string;
  type: string;
  children?: LayerTreeNodeResult[];
}

export async function getLayerTree(draftId: string, maxDepth: number) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const allShapes = getAllShapes(ydoc);
    const childrenByParent = new Map<string | null, Shape[]>();
    for (const shape of allShapes) {
      const pid = shape.parentId ?? null;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid)!.push(shape);
    }

    function buildNode(shape: Shape, depth: number): LayerTreeNodeResult {
      const node: LayerTreeNodeResult = {
        id: shape.id,
        name: shape.name,
        type: shape.type,
      };

      if (depth < maxDepth) {
        const children = childrenByParent.get(shape.id) ?? [];
        if (children.length > 0) {
          node.children = children.map((child) => buildNode(child, depth + 1));
        }
      }

      return node;
    }

    const rootShapes = childrenByParent.get(null) ?? [];
    const tree = rootShapes.map((shape) => buildNode(shape, 0));

    return { tree, totalShapes: allShapes.length };
  });
}

export async function findEmptySpace(
  draftId: string,
  width: number,
  height: number,
  direction: string,
  padding: number,
  nearShapeId: string | null,
) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const allShapes = getAllShapes(ydoc);

    if (allShapes.length === 0) {
      return { x: 0, y: 0, width, height };
    }

    const shapesById = new Map(allShapes.map((s) => [s.id, s]));

    function getAbsBounds(shape: Shape) {
      let absX = shape.x;
      let absY = shape.y;
      let cursor = shape.parentId;
      while (cursor) {
        const parent = shapesById.get(cursor);
        if (!parent) break;
        absX += parent.x;
        absY += parent.y;
        cursor = parent.parentId;
      }
      return { x: absX, y: absY, width: shape.width, height: shape.height };
    }

    let refBounds: { x: number; y: number; width: number; height: number };

    if (nearShapeId) {
      const nearShape = shapesById.get(nearShapeId);
      if (!nearShape) throw new Error('Shape not found');
      refBounds = getAbsBounds(nearShape);
    } else {
      const rootShapes = allShapes.filter((s) => !s.parentId);
      if (rootShapes.length === 0) {
        return { x: 0, y: 0, width, height };
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const s of rootShapes) {
        minX = Math.min(minX, s.x);
        minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x + s.width);
        maxY = Math.max(maxY, s.y + s.height);
      }
      refBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    let candidateX: number;
    let candidateY: number;

    if (direction === 'right') {
      candidateX = refBounds.x + refBounds.width + padding;
      candidateY = refBounds.y;
    } else if (direction === 'bottom') {
      candidateX = refBounds.x;
      candidateY = refBounds.y + refBounds.height + padding;
    } else if (direction === 'left') {
      candidateX = refBounds.x - width - padding;
      candidateY = refBounds.y;
    } else {
      candidateX = refBounds.x;
      candidateY = refBounds.y - height - padding;
    }

    return { x: Math.round(candidateX), y: Math.round(candidateY), width, height };
  });
}
