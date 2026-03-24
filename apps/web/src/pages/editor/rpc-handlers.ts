import type * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';
import {
  addShape,
  getShape,
  updateShape,
  deleteShapes,
  getAllShapes,
  getChildShapes,
  duplicateShapesInPlace,
  groupShapes,
  ungroupShapes,
  frameSelection,
  alignShapes,
  distributeShapes,
  applyAutoLayout,
  applyAutoLayoutForAncestors,
  isAutoLayoutFrame,
  nudgeShapes,
  flipShapes,
  moveShapesInStack,
  moveShapesByDrop,
  applyBooleanOperation,
  createComponent,
  createInstance,
  listComponents,
  removeComponent,
  getPages,
  addPage,
  removePage,
  renamePage,
  setPageBackgroundColor,
  setActivePage,
  getPageGuides,
  addGuide,
  removeGuide,
  exportToSvg,
  exportToPng,
  importSvgShapes,
} from '@draftila/engine';
import type { BooleanOperation, StackMoveDirection, LayerDropPlacement } from '@draftila/engine';

type Args = Record<string, unknown>;
type Handler = (ydoc: Y.Doc, args: Args) => unknown | Promise<unknown>;

function sortByDepth(ydoc: Y.Doc, parentIds: Set<string>): string[] {
  const depths = new Map<string, number>();
  for (const id of parentIds) {
    let depth = 0;
    let current = getShape(ydoc, id);
    while (current?.parentId) {
      depth++;
      current = getShape(ydoc, current.parentId);
    }
    depths.set(id, depth);
  }
  return [...parentIds].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function collectShapesWithDescendants(allShapes: Shape[], rootIds: string[]): Shape[] {
  const rootSet = new Set(rootIds);
  const collected = new Set<string>();

  function addDescendants(id: string) {
    if (collected.has(id)) return;
    collected.add(id);
    for (const s of allShapes) {
      if (s.parentId === id) {
        addDescendants(s.id);
      }
    }
  }

  for (const id of rootIds) {
    addDescendants(id);
  }

  const collectedSet = collected;
  return allShapes.filter((s) => collectedSet.has(s.id) || rootSet.has(s.id));
}

function toAbsoluteProps(ydoc: Y.Doc, props: Record<string, unknown>): Record<string, unknown> {
  const parentId = props['parentId'] as string | undefined;
  if (!parentId) return props;
  const parent = getShape(ydoc, parentId);
  if (!parent) return props;
  const out = { ...props };
  if (typeof out['x'] === 'number') out['x'] = (out['x'] as number) + parent.x;
  if (typeof out['y'] === 'number') out['y'] = (out['y'] as number) + parent.y;
  return out;
}

function applyTextDefaults(props: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  if (out['textAutoResize'] === undefined) out['textAutoResize'] = 'height';
  const fontSize = (out['fontSize'] as number) ?? 16;
  const lineHeight = (out['lineHeight'] as number) ?? 1.2;
  if (out['height'] === undefined) out['height'] = Math.ceil(fontSize * lineHeight);
  if (out['width'] === undefined) out['width'] = 200;
  return out;
}

function toRelativeShape(ydoc: Y.Doc, shape: Shape): Shape {
  if (!shape.parentId) return shape;
  const parent = getShape(ydoc, shape.parentId);
  if (!parent) return shape;
  return { ...shape, x: shape.x - parent.x, y: shape.y - parent.y };
}

const handlers: Record<string, Handler> = {
  create_shape(ydoc, args) {
    const type = args['type'] as ShapeType;
    let rawProps = (args['props'] ?? {}) as Record<string, unknown>;
    if (type === 'text') rawProps = applyTextDefaults(rawProps);
    const props = toAbsoluteProps(ydoc, rawProps);
    const idx = args['childIndex'] as number | undefined;
    const id = addShape(ydoc, type, props as Partial<Shape>, idx);
    applyAutoLayoutForAncestors(ydoc, id);
    return { shapeId: id };
  },

  get_shape(ydoc, args) {
    const shape = getShape(ydoc, args['shapeId'] as string);
    if (!shape) return { error: 'Shape not found' };
    return toRelativeShape(ydoc, shape);
  },

  update_shape(ydoc, args) {
    const shapeId = args['shapeId'] as string;
    const rawProps = args['props'] as Record<string, unknown>;
    const shape = getShape(ydoc, shapeId);
    if (!shape) return { error: 'Shape not found' };
    const props = (
      shape.parentId && (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
        ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
        : rawProps
    ) as Partial<Shape>;
    const before = getShape(ydoc, shapeId);
    updateShape(ydoc, shapeId, props);
    if (before && (typeof props.x === 'number' || typeof props.y === 'number')) {
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
    return { ok: true };
  },

  delete_shapes(ydoc, args) {
    const shapeIds = args['shapeIds'] as string[];
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
    return { deletedIds: shapeIds };
  },

  list_shapes(ydoc, args) {
    const parentId = args['parentId'] as string | undefined;
    const recursive = args['recursive'] as boolean | undefined;
    const shapes = parentId ? getChildShapes(ydoc, parentId) : getAllShapes(ydoc);
    const relativeShapes = shapes.map((s) => toRelativeShape(ydoc, s));

    if (!recursive) {
      return { shapes: relativeShapes, count: relativeShapes.length };
    }

    const allShapes = getAllShapes(ydoc).map((s) => toRelativeShape(ydoc, s));
    const byParent = new Map<string | null, Shape[]>();
    for (const s of allShapes) {
      const pid = s.parentId ?? null;
      const list = byParent.get(pid);
      if (list) list.push(s);
      else byParent.set(pid, [s]);
    }

    type ShapeNode = Shape & { children?: ShapeNode[] };
    const buildTree = (pid: string | null): ShapeNode[] => {
      const children = byParent.get(pid) ?? [];
      return children.map((s) => {
        const kids = buildTree(s.id);
        return kids.length > 0 ? { ...s, children: kids } : { ...s };
      });
    };

    const roots = parentId ? buildTree(parentId) : buildTree(null);
    return { shapes: roots, count: roots.length };
  },

  duplicate_shapes(ydoc, args) {
    const map = duplicateShapesInPlace(ydoc, args['shapeIds'] as string[]);
    return { idMap: Object.fromEntries(map) };
  },

  batch_create_shapes(ydoc, args) {
    const shapes = args['shapes'] as Array<{
      type: string;
      props?: Record<string, unknown>;
      childIndex?: number;
    }>;
    const ids: string[] = [];
    const autoLayoutParents = new Set<string>();

    for (const shape of shapes) {
      let props = { ...(shape.props ?? {}) } as Record<string, unknown>;
      if (typeof props['parentId'] === 'string' && props['parentId'].startsWith('$')) {
        const refIdx = parseInt(props['parentId'].slice(1), 10);
        if (refIdx >= 0 && refIdx < ids.length) {
          props['parentId'] = ids[refIdx];
        }
      }
      if (shape.type === 'text') props = applyTextDefaults(props);
      const absProps = toAbsoluteProps(ydoc, props);
      const id = addShape(
        ydoc,
        shape.type as ShapeType,
        absProps as Partial<Shape>,
        shape.childIndex,
      );
      ids.push(id);
      if (typeof absProps['parentId'] === 'string') {
        const parentShape = getShape(ydoc, absProps['parentId']);
        if (parentShape && isAutoLayoutFrame(parentShape)) {
          autoLayoutParents.add(absProps['parentId']);
        }
      }
    }

    const sorted = sortByDepth(ydoc, autoLayoutParents);
    for (const parentId of sorted) {
      applyAutoLayout(ydoc, parentId);
    }
    for (const id of ids) {
      applyAutoLayoutForAncestors(ydoc, id);
    }

    return { shapeIds: ids, count: ids.length };
  },

  batch_update_shapes(ydoc, args) {
    const updates = args['updates'] as Array<{
      shapeId: string;
      props: Record<string, unknown>;
    }>;
    const affectedIds = new Set<string>();
    for (const update of updates) {
      const shape = getShape(ydoc, update.shapeId);
      const rawProps = update.props;
      const props =
        shape?.parentId && (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
          ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
          : rawProps;
      updateShape(ydoc, update.shapeId, props as Partial<Shape>);
      affectedIds.add(update.shapeId);
    }
    for (const id of affectedIds) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
    return { ok: true };
  },

  group_shapes(ydoc, args) {
    const groupId = groupShapes(ydoc, args['shapeIds'] as string[]);
    return { groupId };
  },

  ungroup_shapes(ydoc, args) {
    const childIds = ungroupShapes(ydoc, args['shapeIds'] as string[]);
    return { childIds };
  },

  frame_selection(ydoc, args) {
    const frameId = frameSelection(ydoc, args['shapeIds'] as string[]);
    return { frameId };
  },

  align_shapes(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const shapeSet = new Set(args['shapeIds'] as string[]);
    const shapes = allShapes.filter((s) => shapeSet.has(s.id));
    type Alignment = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';
    const updates = alignShapes(shapes, args['alignment'] as Alignment);
    for (const [id, pos] of updates) {
      updateShape(ydoc, id, pos as Partial<Shape>);
    }
    return { ok: true };
  },

  distribute_shapes(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const shapeSet = new Set(args['shapeIds'] as string[]);
    const shapes = allShapes.filter((s) => shapeSet.has(s.id));
    type Direction = 'horizontal' | 'vertical';
    const updates = distributeShapes(shapes, args['direction'] as Direction);
    for (const [id, pos] of updates) {
      updateShape(ydoc, id, pos as Partial<Shape>);
    }
    return { ok: true };
  },

  apply_auto_layout(ydoc, args) {
    applyAutoLayout(ydoc, args['frameId'] as string);
    return { ok: true };
  },

  nudge_shapes(ydoc, args) {
    const shapeIds = args['shapeIds'] as string[];
    nudgeShapes(ydoc, shapeIds, args['dx'] as number, args['dy'] as number);
    for (const id of shapeIds) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
    return { ok: true };
  },

  flip_shapes(ydoc, args) {
    flipShapes(ydoc, args['shapeIds'] as string[], args['axis'] as 'horizontal' | 'vertical');
    return { ok: true };
  },

  move_in_stack(ydoc, args) {
    const movedIds = moveShapesInStack(
      ydoc,
      args['shapeIds'] as string[],
      args['direction'] as StackMoveDirection,
    );
    return { movedIds };
  },

  move_by_drop(ydoc, args) {
    const rawPlacement = args['placement'] as LayerDropPlacement;
    const enginePlacement: LayerDropPlacement =
      rawPlacement === 'before' ? 'after' : rawPlacement === 'after' ? 'before' : rawPlacement;
    const movedIds = moveShapesByDrop(
      ydoc,
      args['shapeIds'] as string[],
      args['targetId'] as string,
      enginePlacement,
    );
    for (const id of movedIds) {
      applyAutoLayoutForAncestors(ydoc, id);
    }
    return { movedIds };
  },

  boolean_operation(ydoc, args) {
    const resultId = applyBooleanOperation(
      ydoc,
      args['shapeIds'] as string[],
      args['operation'] as BooleanOperation,
    );
    return { resultId };
  },

  create_component(ydoc, args) {
    const componentId = createComponent(ydoc, args['shapeIds'] as string[], args['name'] as string);
    return { componentId };
  },

  create_instance(ydoc, args) {
    const rootIds = createInstance(
      ydoc,
      args['componentId'] as string,
      args['x'] as number,
      args['y'] as number,
      args['parentId'] as string | undefined,
    );
    return { rootIds };
  },

  list_components(ydoc) {
    const components = listComponents(ydoc);
    return { components };
  },

  remove_component(ydoc, args) {
    const removed = removeComponent(ydoc, args['componentId'] as string);
    return { ok: removed };
  },

  list_pages(ydoc) {
    const pages = getPages(ydoc);
    return { pages };
  },

  add_page(ydoc, args) {
    const pageId = addPage(ydoc, args['name'] as string | undefined);
    return { pageId };
  },

  remove_page(ydoc, args) {
    removePage(ydoc, args['pageId'] as string);
    return { ok: true };
  },

  rename_page(ydoc, args) {
    renamePage(ydoc, args['pageId'] as string, args['name'] as string);
    return { ok: true };
  },

  set_page_background(ydoc, args) {
    setPageBackgroundColor(ydoc, args['pageId'] as string, args['color'] as string | null);
    return { ok: true };
  },

  set_active_page(ydoc, args) {
    const success = setActivePage(ydoc, args['pageId'] as string);
    return { ok: success };
  },

  list_guides(ydoc, args) {
    const guides = getPageGuides(ydoc, args['pageId'] as string);
    return { guides };
  },

  add_guide(ydoc, args) {
    const guideId = addGuide(
      ydoc,
      args['pageId'] as string,
      args['axis'] as 'x' | 'y',
      args['position'] as number,
    );
    return { guideId };
  },

  remove_guide(ydoc, args) {
    removeGuide(ydoc, args['pageId'] as string, args['guideId'] as string);
    return { ok: true };
  },

  export_svg(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const ids = args['shapeIds'] as string[] | undefined;
    if (ids && ids.length > 0) {
      return exportToSvg(collectShapesWithDescendants(allShapes, ids));
    }
    return exportToSvg(allShapes);
  },

  async export_png(ydoc, args) {
    const allShapes = getAllShapes(ydoc);
    const ids = args['shapeIds'] as string[] | undefined;
    const shapes = ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;

    if (shapes.length === 0) return { error: 'No shapes to export' };

    const scale = (args['scale'] as number | undefined) ?? 1;
    const backgroundColor = args['backgroundColor'] as string | undefined;
    const blob = await exportToPng(shapes, scale, backgroundColor);
    const base64 = await blobToBase64(blob);
    return { base64, mimeType: 'image/png' };
  },

  import_svg(ydoc, args) {
    const shapeIds = importSvgShapes(ydoc, args['svg'] as string, {
      targetParentId: (args['targetParentId'] as string | undefined) ?? undefined,
      cursorPosition:
        args['x'] !== undefined && args['y'] !== undefined
          ? { x: args['x'] as number, y: args['y'] as number }
          : undefined,
    });
    return { shapeIds };
  },
};

export function getRpcHandler(tool: string): Handler | undefined {
  return handlers[tool];
}
