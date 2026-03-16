import * as Y from 'yjs';
import type { McpCanvasOp, Shape } from '@draftila/shared';
import {
  addShape,
  deleteShapes,
  getAllShapes,
  getShape,
  groupShapes,
  moveShapesInStack,
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

export async function getCanvasSnapshot(draftId: string) {
  return withDraftDoc(draftId, false, (ydoc) => {
    const shapes = getAllShapes(ydoc);
    return {
      shapeCount: shapes.length,
      shapes,
    };
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

    const limited = filtered.slice(0, options.limit).map((shape) => {
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
      if (shape.type === 'frame') {
        const frame = shape as Shape & {
          layoutMode?: string;
          layoutGap?: number;
          layoutAlign?: string;
          layoutJustify?: string;
        };
        if (frame.layoutMode && frame.layoutMode !== 'none') {
          base.layoutMode = frame.layoutMode;
          base.layoutGap = frame.layoutGap;
          base.layoutAlign = frame.layoutAlign;
          base.layoutJustify = frame.layoutJustify;
        }
      }
      return base;
    });

    return {
      data: limited,
      total: filtered.length,
    };
  });
}
