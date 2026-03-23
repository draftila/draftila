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

const handlers: Record<string, Handler> = {
  create_shape(ydoc, args) {
    const id = addShape(ydoc, args['type'] as ShapeType, (args['props'] ?? {}) as Partial<Shape>);
    applyAutoLayoutForAncestors(ydoc, id);
    return { shapeId: id };
  },

  get_shape(ydoc, args) {
    const shape = getShape(ydoc, args['shapeId'] as string);
    if (!shape) return { error: 'Shape not found' };
    return shape;
  },

  update_shape(ydoc, args) {
    updateShape(ydoc, args['shapeId'] as string, args['props'] as Partial<Shape>);
    applyAutoLayoutForAncestors(ydoc, args['shapeId'] as string);
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
      applyAutoLayoutForAncestors(ydoc, parentId);
    }
    return { ok: true };
  },

  list_shapes(ydoc, args) {
    const parentId = args['parentId'] as string | undefined;
    const shapes = parentId ? getChildShapes(ydoc, parentId) : getAllShapes(ydoc);
    return { shapes, count: shapes.length };
  },

  duplicate_shapes(ydoc, args) {
    const map = duplicateShapesInPlace(ydoc, args['shapeIds'] as string[]);
    return { idMap: Object.fromEntries(map) };
  },

  batch_create_shapes(ydoc, args) {
    const shapes = args['shapes'] as Array<{ type: string; props?: Record<string, unknown> }>;
    const ids: string[] = [];
    const autoLayoutParents = new Set<string>();

    for (const shape of shapes) {
      const props = { ...(shape.props ?? {}) } as Record<string, unknown>;
      if (typeof props['parentId'] === 'string' && props['parentId'].startsWith('$')) {
        const idx = parseInt(props['parentId'].slice(1), 10);
        if (idx >= 0 && idx < ids.length) {
          props['parentId'] = ids[idx];
        }
      }
      const id = addShape(ydoc, shape.type as ShapeType, props as Partial<Shape>);
      ids.push(id);
      if (typeof props['parentId'] === 'string') {
        const parentShape = getShape(ydoc, props['parentId']);
        if (parentShape && isAutoLayoutFrame(parentShape)) {
          autoLayoutParents.add(props['parentId']);
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
      updateShape(ydoc, update.shapeId, update.props as Partial<Shape>);
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
    const movedIds = moveShapesByDrop(
      ydoc,
      args['shapeIds'] as string[],
      args['targetId'] as string,
      args['placement'] as LayerDropPlacement,
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
