import type { Shape, ShapeType } from '@draftila/shared';
import { getShape, getAllShapes, getChildShapes } from '../scene-graph';
import {
  opCreateShape,
  opUpdateShape,
  opBatchUpdateShapes,
  opDeleteShapes,
  opDuplicateShapesInPlace,
} from '../operations';
import { getIconSvg } from '../icons';
import type { RpcHandler } from './types';
import { toAbsoluteProps, applyTextDefaults, toRelativeShape } from './utils';

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
      const compact = args['compact'] as boolean | undefined;
      const shapes = parentId ? getChildShapes(ydoc, parentId) : getAllShapes(ydoc);
      const relativeShapes = shapes.map((s) => toRelativeShape(ydoc, s));

      const compactShape = (s: Shape) => ({
        id: s.id,
        type: s.type,
        name: s.name,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        parentId: s.parentId,
      });

      if (!recursive) {
        const out = compact ? relativeShapes.map(compactShape) : relativeShapes;
        return { shapes: out, count: out.length };
      }

      const allShapes = getAllShapes(ydoc).map((s) => toRelativeShape(ydoc, s));
      const byParent = new Map<string | null, Shape[]>();
      for (const s of allShapes) {
        const pid = s.parentId ?? null;
        const list = byParent.get(pid);
        if (list) list.push(s);
        else byParent.set(pid, [s]);
      }

      type ShapeNode = (Shape | ReturnType<typeof compactShape>) & {
        children?: ShapeNode[];
      };
      const buildTree = (pid: string | null): ShapeNode[] => {
        const children = byParent.get(pid) ?? [];
        return children.map((s) => {
          const node = compact ? compactShape(s) : { ...s };
          const kids = buildTree(s.id);
          return kids.length > 0 ? { ...node, children: kids } : node;
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
        iconName?: string;
        iconSize?: number;
        iconStrokeWidth?: number;
        iconColor?: string;
      }>;
      const ids: string[] = [];

      for (const shape of shapes) {
        let props = { ...(shape.props ?? {}) } as Record<string, unknown>;
        if (typeof props['parentId'] === 'string' && props['parentId'].startsWith('$')) {
          const refIdx = parseInt(props['parentId'].slice(1), 10);
          if (refIdx >= 0 && refIdx < ids.length) {
            props['parentId'] = ids[refIdx];
          }
        }

        let type = shape.type as ShapeType;
        if (shape.iconName) {
          type = 'svg';
          const iconSize = shape.iconSize ?? (props['width'] as number) ?? 24;
          const svg = getIconSvg(
            shape.iconName,
            iconSize,
            shape.iconStrokeWidth ?? 2,
            shape.iconColor ?? '#000000',
          );
          if (svg) {
            props['svgContent'] = svg;
            props['width'] = props['width'] ?? iconSize;
            props['height'] = props['height'] ?? iconSize;
            props['name'] = props['name'] ?? `icon-${shape.iconName}`;
          }
        }

        if (type === 'text') props = applyTextDefaults(props);
        const absProps = toAbsoluteProps(ydoc, props);
        const id = opCreateShape(ydoc, type, absProps as Partial<Shape>, shape.childIndex);
        ids.push(id);
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
