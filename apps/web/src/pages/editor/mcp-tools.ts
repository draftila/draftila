import type * as Y from 'yjs';
import type { Shape, McpCanvasOp } from '@draftila/shared';
import {
  mcpCanvasOpSchema,
  mcpCanvasApplyOpsSchema,
  shapeTypeSchema,
  shapeSchema,
} from '@draftila/shared';
import { z } from 'zod';
import {
  getAllShapes,
  getShape,
  getShapesMap,
  addShape,
  updateShape,
  deleteShapes,
  moveShapesInStack,
  moveShapesByDrop,
  groupShapes,
  ungroupShapes,
} from '@draftila/engine/scene-graph';
import { isAutoLayoutFrame } from '@draftila/engine/auto-layout';
import { applyAutoLayout } from '@draftila/engine/scene-graph';
import { exportToPng, exportToSvg } from '@draftila/engine/export';
import { undo, redo, canUndo, canRedo } from '@draftila/engine/history';

type McpToolHandler = (ydoc: Y.Doc, args: Record<string, unknown>) => unknown | Promise<unknown>;

const toolHandlers = new Map<string, McpToolHandler>();

function registerTool(name: string, handler: McpToolHandler) {
  toolHandlers.set(name, handler);
}

export function handleMcpTool(
  ydoc: Y.Doc,
  tool: string,
  args: Record<string, unknown>,
): unknown | Promise<unknown> {
  const handler = toolHandlers.get(tool);
  if (!handler) {
    throw new Error(`Unknown tool: ${tool}`);
  }
  return handler(ydoc, args);
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
  if (shape.type === 'svg') base.preserveAspectRatio = typed.preserveAspectRatio;

  return base;
}

registerTool('canvas.snapshot', (ydoc, args) => {
  const parentId = typeof args.parentId === 'string' ? args.parentId : null;
  const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : Infinity;

  const allShapes = getAllShapes(ydoc);

  let filtered: Shape[];
  if (parentId) {
    const shapesById = new Map(allShapes.map((s) => [s.id, s]));
    filtered = allShapes.filter((shape) => {
      if (shape.id === parentId) return true;
      let cursor = shape.parentId;
      let depth = 0;
      while (cursor) {
        depth++;
        if (cursor === parentId) return depth <= maxDepth;
        cursor = shapesById.get(cursor)?.parentId ?? null;
      }
      return false;
    });
  } else if (maxDepth !== Infinity) {
    const shapesById = new Map(allShapes.map((s) => [s.id, s]));
    filtered = allShapes.filter((shape) => {
      let depth = 0;
      let cursor = shape.parentId;
      while (cursor) {
        depth++;
        cursor = shapesById.get(cursor)?.parentId ?? null;
      }
      return depth <= maxDepth;
    });
  } else {
    filtered = allShapes;
  }

  return { shapeCount: filtered.length, shapes: filtered.map(summarizeShape) };
});

registerTool('canvas.find_shapes', (ydoc, args) => {
  const parsed = z
    .object({
      draftId: z.string(),
      nameContains: z.string().trim().min(1).max(255).optional(),
      type: shapeTypeSchema.optional(),
      parentId: z.string().nullable().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    })
    .safeParse(args);

  if (!parsed.success) {
    throw new Error('Invalid tool arguments');
  }

  const normalizedNameContains = parsed.data.nameContains?.trim().toLowerCase();
  const shapes = getAllShapes(ydoc);
  const filtered = shapes.filter((shape) => {
    if (parsed.data.type && shape.type !== parsed.data.type) {
      return false;
    }
    if (parsed.data.parentId !== undefined && shape.parentId !== parsed.data.parentId) {
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

  const limited = filtered.slice(0, parsed.data.limit).map(summarizeShape);

  return { data: limited, total: filtered.length };
});

registerTool('canvas.get_shape', (ydoc, args) => {
  const shapeId = typeof args.shapeId === 'string' ? args.shapeId : null;
  if (!shapeId) {
    throw new Error('Invalid tool arguments: expected { shapeId: string }');
  }
  const shape = getShape(ydoc, shapeId);
  if (!shape) {
    throw new Error('Shape not found');
  }
  return { shape };
});

registerTool('canvas.undo', (_ydoc) => {
  if (!canUndo()) {
    return { success: false, message: 'Nothing to undo' };
  }
  undo();
  return { success: true };
});

registerTool('canvas.redo', (_ydoc) => {
  if (!canRedo()) {
    return { success: false, message: 'Nothing to redo' };
  }
  redo();
  return { success: true };
});

registerTool('canvas.align', (ydoc, args) => {
  const parsed = z
    .object({
      draftId: z.string(),
      ids: z.array(z.string()).min(1),
      axis: z.enum(['left', 'center_horizontal', 'right', 'top', 'center_vertical', 'bottom']),
    })
    .safeParse(args);

  if (!parsed.success) {
    throw new Error('Invalid tool arguments');
  }

  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((s) => [s.id, s]));
  const targets = parsed.data.ids
    .map((id) => shapesById.get(id))
    .filter((s): s is Shape => Boolean(s));

  if (targets.length === 0) throw new Error('No valid shapes found');

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of targets) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }

  const { axis } = parsed.data;

  ydoc.transact(() => {
    for (const s of targets) {
      if (axis === 'left') updateShape(ydoc, s.id, { x: minX } as Partial<Shape>);
      else if (axis === 'right') updateShape(ydoc, s.id, { x: maxX - s.width } as Partial<Shape>);
      else if (axis === 'center_horizontal')
        updateShape(ydoc, s.id, {
          x: (minX + maxX) / 2 - s.width / 2,
        } as Partial<Shape>);
      else if (axis === 'top') updateShape(ydoc, s.id, { y: minY } as Partial<Shape>);
      else if (axis === 'bottom') updateShape(ydoc, s.id, { y: maxY - s.height } as Partial<Shape>);
      else if (axis === 'center_vertical')
        updateShape(ydoc, s.id, {
          y: (minY + maxY) / 2 - s.height / 2,
        } as Partial<Shape>);
    }
  });

  return { aligned: targets.length };
});

registerTool('canvas.distribute', (ydoc, args) => {
  const parsed = z
    .object({
      draftId: z.string(),
      ids: z.array(z.string()).min(3),
      axis: z.enum(['horizontal', 'vertical']),
      gap: z.number().optional(),
    })
    .safeParse(args);

  if (!parsed.success) {
    throw new Error('Invalid tool arguments: need at least 3 shape ids');
  }

  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((s) => [s.id, s]));
  const targets = parsed.data.ids
    .map((id) => shapesById.get(id))
    .filter((s): s is Shape => Boolean(s));

  if (targets.length < 3) throw new Error('Need at least 3 valid shapes');

  const isHorizontal = parsed.data.axis === 'horizontal';

  const sorted = [...targets].sort((a, b) => (isHorizontal ? a.x - b.x : a.y - b.y));

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (parsed.data.gap !== undefined) {
    const gap = parsed.data.gap;
    ydoc.transact(() => {
      let pos = isHorizontal ? first.x : first.y;
      for (const s of sorted) {
        if (isHorizontal) {
          updateShape(ydoc, s.id, { x: pos } as Partial<Shape>);
          pos += s.width + gap;
        } else {
          updateShape(ydoc, s.id, { y: pos } as Partial<Shape>);
          pos += s.height + gap;
        }
      }
    });
  } else {
    const totalStart = isHorizontal ? first.x : first.y;
    const totalEnd = isHorizontal ? last.x + last.width : last.y + last.height;
    const totalSize = sorted.reduce((sum, s) => sum + (isHorizontal ? s.width : s.height), 0);
    const gap = (totalEnd - totalStart - totalSize) / (sorted.length - 1);

    ydoc.transact(() => {
      let pos = totalStart;
      for (const s of sorted) {
        if (isHorizontal) {
          updateShape(ydoc, s.id, { x: pos } as Partial<Shape>);
          pos += s.width + gap;
        } else {
          updateShape(ydoc, s.id, { y: pos } as Partial<Shape>);
          pos += s.height + gap;
        }
      }
    });
  }

  return { distributed: targets.length };
});

function resolveIdToken(id: string, refs: Map<string, string>) {
  if (!id.startsWith('@')) {
    return id;
  }
  return refs.get(id.slice(1)) ?? null;
}

function resolveShapePropsWithRefs(
  props: Record<string, unknown> | undefined,
  refs: Map<string, string>,
) {
  if (!props) return props;
  const rawParentId = props.parentId;
  if (typeof rawParentId !== 'string') return props;
  const resolvedParentId = resolveIdToken(rawParentId, refs);
  if (!resolvedParentId) return props;
  return { ...props, parentId: resolvedParentId };
}

function parseCanvasOp(input: unknown): McpCanvasOp | null {
  const direct = mcpCanvasOpSchema.safeParse(input);
  if (direct.success) {
    if (
      direct.data.type === 'duplicate_shapes' &&
      direct.data.refs &&
      direct.data.refs.length !== direct.data.ids.length
    ) {
      return null;
    }
    return direct.data;
  }

  if (!input || typeof input !== 'object') return null;

  const raw = input as Record<string, unknown>;
  const rawType =
    (typeof raw.type === 'string' ? raw.type : null) ??
    (typeof raw.action === 'string' ? raw.action : null) ??
    (typeof raw.operation === 'string' ? raw.operation : null);

  if (!rawType) return null;

  const normalizedType = (() => {
    if (rawType === 'create' || rawType === 'insert' || rawType === 'create_shape')
      return 'add_shape' as const;
    if (rawType === 'update' || rawType === 'patch_shape') return 'update_shape' as const;
    if (rawType === 'delete' || rawType === 'remove' || rawType === 'delete_shape')
      return 'delete_shapes' as const;
    if (rawType === 'move' || rawType === 'move_shapes') return 'move_stack' as const;
    if (rawType === 'group') return 'group_shapes' as const;
    if (rawType === 'ungroup') return 'ungroup_shapes' as const;
    if (rawType === 'duplicate' || rawType === 'clone' || rawType === 'copy_shapes')
      return 'duplicate_shapes' as const;
    return rawType;
  })();

  const shapeTypeValue =
    (typeof raw.shapeType === 'string' ? raw.shapeType : null) ??
    (typeof raw.kind === 'string' ? raw.kind : null) ??
    (typeof raw.shape === 'string' ? raw.shape : null);
  const propsValue =
    (raw.props && typeof raw.props === 'object' ? raw.props : null) ??
    (raw.properties && typeof raw.properties === 'object' ? raw.properties : null) ??
    (raw.data && typeof raw.data === 'object' ? raw.data : null) ??
    undefined;
  const idValue =
    (typeof raw.id === 'string' ? raw.id : null) ??
    (typeof raw.shapeId === 'string' ? raw.shapeId : null);
  const idsValue = Array.isArray(raw.ids)
    ? raw.ids.filter((item): item is string => typeof item === 'string')
    : undefined;

  const knownOpKeys = new Set([
    'type',
    'action',
    'operation',
    'shapeType',
    'ref',
    'kind',
    'shape',
    'props',
    'properties',
    'data',
    'id',
    'shapeId',
    'ids',
    'offset',
    'refs',
    'direction',
    'draftId',
    'op',
    'ops',
  ]);

  const topLevelProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (knownOpKeys.has(key)) continue;
    topLevelProps[key] = value;
  }

  const mergedProps =
    Object.keys(topLevelProps).length > 0
      ? { ...(propsValue ?? {}), ...topLevelProps }
      : propsValue;

  const candidate: Record<string, unknown> = { type: normalizedType };

  if (normalizedType === 'add_shape') {
    candidate.shapeType = shapeTypeValue;
    if (typeof raw.ref === 'string') candidate.ref = raw.ref;
    if (mergedProps) candidate.props = mergedProps;
  }

  if (normalizedType === 'update_shape') {
    candidate.id = idValue;
    candidate.props = mergedProps;
  }

  if (
    normalizedType === 'delete_shapes' ||
    normalizedType === 'group_shapes' ||
    normalizedType === 'ungroup_shapes'
  ) {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
  }

  if (normalizedType === 'move_stack') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    candidate.direction = raw.direction;
  }

  if (normalizedType === 'duplicate_shapes') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    if (raw.offset && typeof raw.offset === 'object') candidate.offset = raw.offset;
    if (Array.isArray(raw.refs))
      candidate.refs = raw.refs.filter((item): item is string => typeof item === 'string');
    if (
      Array.isArray(candidate.ids) &&
      Array.isArray(candidate.refs) &&
      candidate.ids.length !== candidate.refs.length
    )
      return null;
  }

  const parsedCandidate = mcpCanvasOpSchema.safeParse(candidate);
  if (!parsedCandidate.success) return null;
  return parsedCandidate.data;
}

function getTopLevelIds(ids: string[], shapesById: Map<string, Shape>) {
  const idSet = new Set(ids.filter((id) => shapesById.has(id)));
  const topLevelIds: string[] = [];

  for (const id of ids) {
    if (!idSet.has(id)) continue;
    let currentParentId = shapesById.get(id)?.parentId ?? null;
    let hasSelectedAncestor = false;
    while (currentParentId) {
      if (idSet.has(currentParentId)) {
        hasSelectedAncestor = true;
        break;
      }
      currentParentId = shapesById.get(currentParentId)?.parentId ?? null;
    }
    if (!hasSelectedAncestor) topLevelIds.push(id);
  }

  return topLevelIds;
}

function duplicateShapesInDoc(
  ydoc: Y.Doc,
  ids: string[],
  offset: { x: number; y: number },
  refs: Map<string, string>,
  requestedRefs?: string[],
) {
  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((s) => [s.id, s]));
  const rootIds = getTopLevelIds(ids, shapesById);
  if (rootIds.length === 0) return [] as string[];

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
    if (!duplicateIdSet.has(shape.id)) continue;
    const isRoot = rootIdSet.has(shape.id);
    const nextParentId = isRoot ? shape.parentId : (oldToNewIds.get(shape.parentId ?? '') ?? null);
    const { id: _id, ...rest } = shape;
    const newId = addShape(ydoc, shape.type, {
      ...rest,
      parentId: nextParentId,
      x: shape.x + offset.x,
      y: shape.y + offset.y,
    } as Partial<Shape>);
    oldToNewIds.set(shape.id, newId);
    if (isRoot) newRootIds.push(newId);
  }

  if (requestedRefs) {
    for (const [index, refName] of requestedRefs.entries()) {
      const newId = newRootIds[index];
      if (!newId) continue;
      refs.set(refName, newId);
    }
  }

  return newRootIds;
}

registerTool('canvas.apply_ops', (ydoc, args) => {
  const rawOps = Array.isArray(args.ops) ? args.ops : args.op !== undefined ? [args.op] : null;
  if (!rawOps || rawOps.length === 0 || rawOps.length > 200) {
    throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
  }

  const normalizedOps: McpCanvasOp[] = [];
  for (const rawOp of rawOps) {
    const parsedOp = parseCanvasOp(rawOp);
    if (!parsedOp) {
      throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
    }
    normalizedOps.push(parsedOp);
  }

  const parsed = mcpCanvasApplyOpsSchema.safeParse({ draftId: args.draftId, ops: normalizedOps });
  if (!parsed.success) {
    throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
  }

  const createdShapeIds: string[] = [];
  const createdRefs = new Map<string, string>();
  const groupedShapeIds: string[] = [];
  const ungroupedShapeIds: string[] = [];
  const textShapesToAutoSize: string[] = [];

  ydoc.transact(() => {
    for (const op of normalizedOps) {
      if (op.type === 'add_shape') {
        const resolvedProps = resolveShapePropsWithRefs(op.props, createdRefs);
        const createdId = addShape(ydoc, op.shapeType, (resolvedProps ?? {}) as Partial<Shape>);
        createdShapeIds.push(createdId);
        if (op.ref) createdRefs.set(op.ref, createdId);
        if (op.shapeType === 'text') {
          const p = (resolvedProps ?? {}) as Record<string, unknown>;
          const hasExplicitWidth = typeof p.width === 'number';
          const hasExplicitHeight = typeof p.height === 'number';
          if (!hasExplicitWidth || !hasExplicitHeight) {
            textShapesToAutoSize.push(createdId);
          }
        }
        continue;
      }
      if (op.type === 'update_shape') {
        const resolvedId = resolveIdToken(op.id, createdRefs);
        if (!resolvedId) continue;
        const resolvedProps = resolveShapePropsWithRefs(op.props, createdRefs);
        updateShape(ydoc, resolvedId, resolvedProps as Partial<Shape>);
        continue;
      }
      if (op.type === 'delete_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) continue;
        deleteShapes(ydoc, ids);
        continue;
      }
      if (op.type === 'move_stack') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) continue;
        moveShapesInStack(ydoc, ids, op.direction);
        continue;
      }
      if (op.type === 'group_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length < 2) continue;
        const groupId = groupShapes(ydoc, ids);
        if (groupId) groupedShapeIds.push(groupId);
        continue;
      }
      if (op.type === 'ungroup_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) continue;
        const childIds = ungroupShapes(ydoc, ids);
        ungroupedShapeIds.push(...childIds);
      }
      if (op.type === 'duplicate_shapes') {
        const ids = op.ids
          .map((id: string) => resolveIdToken(id, createdRefs))
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length === 0) continue;
        duplicateShapesInDoc(
          ydoc,
          ids,
          { x: op.offset?.x ?? 20, y: op.offset?.y ?? 20 },
          createdRefs,
          op.refs,
        );
      }
    }
  });

  if (textShapesToAutoSize.length > 0) {
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (measureCtx) {
      for (const textId of textShapesToAutoSize) {
        const shape = getShape(ydoc, textId);
        if (!shape || shape.type !== 'text') continue;
        const typed = shape as Shape & {
          content?: string;
          fontSize?: number;
          fontFamily?: string;
          fontWeight?: number;
          lineHeight?: number;
        };
        const content = typed.content ?? '';
        if (!content) continue;
        const fontSize = typed.fontSize ?? 16;
        const fontFamily = typed.fontFamily ?? 'Inter';
        const fontWeight = typed.fontWeight ?? 400;
        const lineHeight = typed.lineHeight ?? 1.2;

        measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        const lines = content.split('\n');
        let maxWidth = 0;
        for (const line of lines) {
          const metrics = measureCtx.measureText(line);
          if (metrics.width > maxWidth) maxWidth = metrics.width;
        }
        const padding = 4;
        const measuredWidth = Math.ceil(maxWidth) + padding;
        const measuredHeight = Math.ceil(lines.length * fontSize * lineHeight) + padding;

        const updates: Partial<Shape> = {};
        if (shape.width === 100) (updates as Record<string, unknown>).width = measuredWidth;
        if (shape.height === 100) (updates as Record<string, unknown>).height = measuredHeight;
        if (Object.keys(updates).length > 0) {
          updateShape(ydoc, textId, updates);
        }
      }
    }
  }

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
    appliedCount: normalizedOps.length,
    createdShapeIds,
    createdRefs: Object.fromEntries(createdRefs),
    groupedShapeIds,
    ungroupedShapeIds,
    shapeCount: getAllShapes(ydoc).length,
  };
});

registerTool('canvas.apply_op', (ydoc, args) => {
  const handler = toolHandlers.get('canvas.apply_ops')!;
  const op = args.op ?? args;
  const adaptedArgs = {
    ...args,
    ops: [op],
  };
  return handler(ydoc, adaptedArgs);
});

registerTool('canvas.set_image', (ydoc, args) => {
  const shapeId = typeof args.shapeId === 'string' ? args.shapeId : null;
  const src = typeof args.src === 'string' ? args.src : null;
  const fit = typeof args.fit === 'string' ? args.fit : undefined;

  if (!shapeId || !src) {
    throw new Error('Invalid tool arguments: expected { shapeId: string, src: string }');
  }

  const shape = getAllShapes(ydoc).find((s) => s.id === shapeId);
  if (!shape) {
    throw new Error('Shape not found');
  }
  if (shape.type !== 'image') {
    throw new Error('Shape is not an image shape');
  }

  const props: Record<string, unknown> = { src };
  if (fit === 'fill' || fit === 'fit' || fit === 'crop') {
    props.fit = fit;
  }

  updateShape(ydoc, shapeId, props as Partial<Shape>);
  return { shapeId, src: src.length > 100 ? `${src.substring(0, 100)}...` : src };
});

registerTool('canvas.screenshot', async (ydoc, args) => {
  const shapeIds = Array.isArray(args.shapeIds) ? args.shapeIds : null;
  const scale = typeof args.scale === 'number' ? args.scale : 2;

  const allShapes = getAllShapes(ydoc);
  const shapesToCapture = shapeIds
    ? allShapes.filter((s) => (shapeIds as string[]).includes(s.id))
    : allShapes;

  if (shapesToCapture.length === 0) {
    throw new Error('No shapes to screenshot');
  }

  const blob = await exportToPng(shapesToCapture, scale);
  const buffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
  );

  return { data: base64, mimeType: 'image/png' };
});

interface LayoutNode {
  id: string;
  name: string;
  type: string;
  bounds: { x: number; y: number; width: number; height: number };
  problems?: string[];
  children?: LayoutNode[];
}

function getAbsoluteBounds(shape: Shape, shapesById: Map<string, Shape>) {
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

function detectProblems(
  shape: Shape,
  siblings: Shape[],
  parentShape: Shape | null,
  shapesById: Map<string, Shape>,
): string[] {
  const problems: string[] = [];
  const bounds = getAbsoluteBounds(shape, shapesById);

  if (parentShape) {
    const parentBounds = getAbsoluteBounds(parentShape, shapesById);
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
    const sibBounds = { x: sibling.x, y: sibling.y, width: sibling.width, height: sibling.height };
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

registerTool('canvas.get_layout', (ydoc, args) => {
  const parentId = typeof args.parentId === 'string' ? args.parentId : null;
  const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 1;
  const problemsOnly = args.problemsOnly === true;

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
    const problems = detectProblems(shape, siblings, parentShape, shapesById);

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

    if (problemsOnly && !node.problems?.length && !node.children?.some((c) => c.problems?.length)) {
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

registerTool('canvas.move_to_parent', (ydoc, args) => {
  const parsed = z
    .object({
      draftId: z.string(),
      ids: z.array(z.string()).min(1).max(100),
      parentId: z.string().nullable(),
      index: z.number().int().min(0).optional(),
    })
    .safeParse(args);

  if (!parsed.success) {
    throw new Error('Invalid tool arguments');
  }

  const { ids, parentId } = parsed.data;
  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((s) => [s.id, s]));

  if (parentId) {
    const parentShape = shapesById.get(parentId);
    if (!parentShape) throw new Error('Parent shape not found');
    if (parentShape.type !== 'frame' && parentShape.type !== 'group') {
      throw new Error('Parent must be a frame or group');
    }
  }

  const validIds = ids.filter((id) => shapesById.get(id));
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

registerTool('canvas.replace_properties', (ydoc, args) => {
  const parentIds = Array.isArray(args.parentIds) ? (args.parentIds as string[]) : [];
  const replacements = (args.replacements ?? {}) as Record<
    string,
    Array<{ from: unknown; to: unknown }>
  >;

  if (parentIds.length === 0) throw new Error('Invalid tool arguments: parentIds required');

  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((s) => [s.id, s]));

  function getDescendants(rootId: string): Shape[] {
    const result: Shape[] = [];
    const rootShape = shapesById.get(rootId);
    if (rootShape) result.push(rootShape);
    for (const shape of allShapes) {
      if (shape.id === rootId) continue;
      let cursor = shape.parentId;
      while (cursor) {
        if (cursor === rootId) {
          result.push(shape);
          break;
        }
        cursor = shapesById.get(cursor)?.parentId ?? null;
      }
    }
    return result;
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
        const fills = typed.fills as Array<{ color: string }> | undefined;
        if (fills) {
          const yFills = shapeData.get('fills') as
            | import('yjs').Array<import('yjs').Map<unknown>>
            | undefined;
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
      }

      if (replacements.textColor && shape.type === 'text') {
        const yFills = shapeData.get('fills') as
          | import('yjs').Array<import('yjs').Map<unknown>>
          | undefined;
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
        const yStrokes = shapeData.get('strokes') as
          | import('yjs').Array<import('yjs').Map<unknown>>
          | undefined;
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
        const yStrokes = shapeData.get('strokes') as
          | import('yjs').Array<import('yjs').Map<unknown>>
          | undefined;
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

registerTool('canvas.search_properties', (ydoc, args) => {
  const parentIds = Array.isArray(args.parentIds) ? (args.parentIds as string[]) : [];
  const searchProps = Array.isArray(args.properties) ? (args.properties as string[]) : [];

  if (parentIds.length === 0 || searchProps.length === 0) {
    throw new Error('Invalid tool arguments');
  }

  const allShapes = getAllShapes(ydoc);
  const shapesById = new Map(allShapes.map((s) => [s.id, s]));

  function getDescendants(rootId: string): Shape[] {
    const result: Shape[] = [];
    const rootShape = shapesById.get(rootId);
    if (rootShape) result.push(rootShape);
    for (const shape of allShapes) {
      if (shape.id === rootId) continue;
      let cursor = shape.parentId;
      while (cursor) {
        if (cursor === rootId) {
          result.push(shape);
          break;
        }
        cursor = shapesById.get(cursor)?.parentId ?? null;
      }
    }
    return result;
  }

  const targetShapes = new Map<string, Shape>();
  for (const pid of parentIds) {
    for (const shape of getDescendants(pid)) {
      targetShapes.set(shape.id, shape);
    }
  }

  const result: Record<string, unknown[]> = {};

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
    result[prop] = numericProps.has(prop)
      ? [...values].map(Number).sort((a, b) => a - b)
      : [...values].sort();
  }

  return { properties: result, shapesSearched: targetShapes.size };
});

registerTool('canvas.find_empty_space', (ydoc, args) => {
  const width = typeof args.width === 'number' ? args.width : 100;
  const height = typeof args.height === 'number' ? args.height : 100;
  const direction = typeof args.direction === 'string' ? args.direction : 'right';
  const padding = typeof args.padding === 'number' ? args.padding : 100;
  const nearShapeId = typeof args.nearShapeId === 'string' ? args.nearShapeId : null;

  const allShapes = getAllShapes(ydoc);

  if (allShapes.length === 0) {
    return { x: 0, y: 0, width, height };
  }

  const shapesById = new Map(allShapes.map((s) => [s.id, s]));

  let refBounds: { x: number; y: number; width: number; height: number };

  if (nearShapeId) {
    const nearShape = shapesById.get(nearShapeId);
    if (!nearShape) throw new Error('Shape not found');
    refBounds = getAbsoluteBounds(nearShape, shapesById);
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

registerTool('canvas.get_layer_tree', (ydoc, args) => {
  const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : Infinity;

  const allShapes = getAllShapes(ydoc);
  const childrenByParent = new Map<string | null, Shape[]>();
  for (const shape of allShapes) {
    const pid = shape.parentId ?? null;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid)!.push(shape);
  }

  interface TreeNode {
    id: string;
    name: string;
    type: string;
    children?: TreeNode[];
  }

  function buildNode(shape: Shape, depth: number): TreeNode {
    const node: TreeNode = {
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
