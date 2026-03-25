import type { Shape, ShapeType } from '@draftila/shared';
import { addShape, getShape, getAllShapes, getChildShapes } from '../scene-graph';
import { isAutoLayoutFrame } from '../auto-layout';
import { applyAutoLayout, applyAutoLayoutForAncestors } from '../scene-graph/layout-ops';
import {
  opCreateShape,
  opUpdateShape,
  opBatchUpdateShapes,
  opDeleteShapes,
  opDuplicateShapesInPlace,
} from '../operations';
import type { RpcHandler } from './types';
import { sortByDepth, toAbsoluteProps, applyTextDefaults, toRelativeShape } from './utils';

export function shapeHandlers(): Record<string, RpcHandler> {
  return {
    create_shape(ydoc, args) {
      const type = args['type'] as ShapeType;
      let rawProps = (args['props'] ?? {}) as Record<string, unknown>;
      if (type === 'text') rawProps = applyTextDefaults(rawProps);
      const props = toAbsoluteProps(ydoc, rawProps);
      const idx = args['childIndex'] as number | undefined;
      const id = opCreateShape(ydoc, type, props as Partial<Shape>, idx);
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
      opUpdateShape(ydoc, shapeId, props);
      return { ok: true };
    },

    delete_shapes(ydoc, args) {
      const shapeIds = args['shapeIds'] as string[];
      opDeleteShapes(ydoc, shapeIds);
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
      const map = opDuplicateShapesInPlace(ydoc, args['shapeIds'] as string[]);
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
      const resolved = updates.map((update) => {
        const shape = getShape(ydoc, update.shapeId);
        const rawProps = update.props;
        const props =
          shape?.parentId &&
          (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
            ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
            : rawProps;
        return { shapeId: update.shapeId, props: props as Partial<Shape> };
      });
      opBatchUpdateShapes(ydoc, resolved);
      return { ok: true };
    },
  };
}
