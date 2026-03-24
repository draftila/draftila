import type * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';
import {
  addShape,
  getShape,
  updateShape,
  deleteShapes,
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
import { alignShapes, distributeShapes } from './selection';
import { isAutoLayoutFrame } from './auto-layout';
import { duplicateShapesInPlace } from './clipboard';
import { createComponent, createInstance, listComponents, removeComponent } from './components';
import {
  getPages,
  addPage,
  removePage,
  renamePage,
  setPageBackgroundColor,
  setActivePage,
} from './pages';
import { getPageGuides, addGuide, removeGuide } from './guides';
import { exportToSvg } from './export';
import { importSvgShapes } from './shape-import';
import { getVariables, setVariable, deleteVariable } from './variables';
import { getIconNames, searchIcons, getIconSvg } from './icons';

export type RpcArgs = Record<string, unknown>;
export type RpcHandler = (ydoc: Y.Doc, args: RpcArgs) => unknown | Promise<unknown>;

export function sortByDepth(ydoc: Y.Doc, parentIds: Set<string>): string[] {
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

export function collectShapesWithDescendants(allShapes: Shape[], rootIds: string[]): Shape[] {
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

  return allShapes.filter((s) => collected.has(s.id) || rootSet.has(s.id));
}

export function toAbsoluteProps(
  ydoc: Y.Doc,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const parentId = props['parentId'] as string | undefined;
  if (!parentId) return props;
  const parent = getShape(ydoc, parentId);
  if (!parent) return props;
  const out = { ...props };
  if (typeof out['x'] === 'number') out['x'] = (out['x'] as number) + parent.x;
  if (typeof out['y'] === 'number') out['y'] = (out['y'] as number) + parent.y;
  return out;
}

export function applyTextDefaults(props: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  if (out['textAutoResize'] === undefined) out['textAutoResize'] = 'width';
  if (out['textAlign'] === undefined) out['textAlign'] = 'center';
  const fontSize = (out['fontSize'] as number) ?? 16;
  const lineHeight = (out['lineHeight'] as number) ?? 1.2;
  if (out['height'] === undefined) out['height'] = Math.ceil(fontSize * lineHeight);
  if (out['width'] === undefined) out['width'] = 200;
  return out;
}

export function toRelativeShape(ydoc: Y.Doc, shape: Shape): Shape {
  if (!shape.parentId) return shape;
  const parent = getShape(ydoc, shape.parentId);
  if (!parent) return shape;
  return { ...shape, x: shape.x - parent.x, y: shape.y - parent.y };
}

export function createRpcHandlers(
  overrides?: Partial<Record<string, RpcHandler>>,
): Record<string, RpcHandler> {
  const handlers: Record<string, RpcHandler> = {
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
          shape?.parentId &&
          (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
            ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
            : rawProps;
        const before = getShape(ydoc, update.shapeId);
        updateShape(ydoc, update.shapeId, props as Partial<Shape>);
        if (before && (typeof props['x'] === 'number' || typeof props['y'] === 'number')) {
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
      return { ok: true };
    },

    group_shapes(ydoc, args) {
      return { groupId: groupShapes(ydoc, args['shapeIds'] as string[]) };
    },

    ungroup_shapes(ydoc, args) {
      return { childIds: ungroupShapes(ydoc, args['shapeIds'] as string[]) };
    },

    frame_selection(ydoc, args) {
      return { frameId: frameSelection(ydoc, args['shapeIds'] as string[]) };
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
      return {
        resultId: applyBooleanOperation(
          ydoc,
          args['shapeIds'] as string[],
          args['operation'] as BooleanOperation,
        ),
      };
    },

    create_component(ydoc, args) {
      return {
        componentId: createComponent(ydoc, args['shapeIds'] as string[], args['name'] as string),
      };
    },

    create_instance(ydoc, args) {
      return {
        rootIds: createInstance(
          ydoc,
          args['componentId'] as string,
          args['x'] as number,
          args['y'] as number,
          args['parentId'] as string | undefined,
        ),
      };
    },

    list_components(ydoc) {
      return { components: listComponents(ydoc) };
    },

    remove_component(ydoc, args) {
      return { ok: removeComponent(ydoc, args['componentId'] as string) };
    },

    list_pages(ydoc) {
      return { pages: getPages(ydoc) };
    },

    add_page(ydoc, args) {
      return { pageId: addPage(ydoc, args['name'] as string | undefined) };
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
      return { ok: setActivePage(ydoc, args['pageId'] as string) };
    },

    list_guides(ydoc, args) {
      return { guides: getPageGuides(ydoc, args['pageId'] as string) };
    },

    add_guide(ydoc, args) {
      return {
        guideId: addGuide(
          ydoc,
          args['pageId'] as string,
          args['axis'] as 'x' | 'y',
          args['position'] as number,
        ),
      };
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

    import_svg(ydoc, args) {
      const targetParentId = (args['targetParentId'] as string | undefined) ?? undefined;
      const shapeIds = importSvgShapes(ydoc, args['svg'] as string, {
        targetParentId,
        cursorPosition:
          args['x'] !== undefined && args['y'] !== undefined
            ? { x: args['x'] as number, y: args['y'] as number }
            : undefined,
      });
      if (targetParentId) {
        const parent = getShape(ydoc, targetParentId);
        if (parent && isAutoLayoutFrame(parent)) {
          applyAutoLayout(ydoc, targetParentId);
        }
      }
      for (const id of shapeIds) {
        applyAutoLayoutForAncestors(ydoc, id);
      }
      return { shapeIds };
    },

    list_variables(ydoc) {
      return { variables: getVariables(ydoc) };
    },

    set_variable(ydoc, args) {
      const id = args['id'] as string;
      const name = args['name'] as string;
      const value = args['value'] as string;
      return { variable: setVariable(ydoc, id, name, value) };
    },

    delete_variable(ydoc, args) {
      return { ok: deleteVariable(ydoc, args['id'] as string) };
    },

    list_icons(_ydoc, args) {
      const query = args['query'] as string | undefined;
      return { icons: query ? searchIcons(query) : getIconNames() };
    },

    insert_icon(ydoc, args) {
      const name = args['name'] as string;
      const size = (args['size'] as number) ?? 24;
      const strokeWidth = (args['strokeWidth'] as number) ?? 2;
      const color = (args['color'] as string) ?? '#000000';
      const svg = getIconSvg(name, size, strokeWidth, color);
      if (!svg) return { error: `Icon "${name}" not found` };
      const parentId = (args['parentId'] as string | undefined) ?? undefined;
      let rawProps: Record<string, unknown> = {
        x: (args['x'] as number) ?? 0,
        y: (args['y'] as number) ?? 0,
        width: size,
        height: size,
        svgContent: svg,
        name: `icon-${name}`,
      };
      if (parentId) rawProps['parentId'] = parentId;
      rawProps = toAbsoluteProps(ydoc, rawProps);
      const id = addShape(ydoc, 'svg', rawProps as Partial<Shape>);
      applyAutoLayoutForAncestors(ydoc, id);
      return { shapeId: id };
    },
  };

  if (overrides) {
    for (const [key, handler] of Object.entries(overrides)) {
      if (handler) handlers[key] = handler;
    }
  }

  return handlers;
}
