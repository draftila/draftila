import type { Fill, FrameShape, Shape, ShapeType, TextShape } from '@draftila/shared';
import { getShapeKnownKeys } from '@draftila/shared';
import { getShape, getAllShapes, getChildShapes } from '../scene-graph';
import {
  opCreateShape,
  opBatchCreateShapes,
  opUpdateShape,
  opBatchUpdateShapes,
  opDeleteShapes,
  opDuplicateShapesInPlace,
  type BatchCreateItem,
} from '../operations';
import { getIconSvg } from '../icons';
import type { RpcHandler } from './types';
import {
  toAbsoluteProps,
  applyTextDefaults,
  toRelativeShape,
  sanitizeColorVars,
  collectShapesWithDescendants,
} from './utils';

const MAX_BATCH_CREATE_NODES = 200;
const COMPACT_CONTENT_LIMIT = 80;

function compactShape(s: Shape): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: s.id,
    type: s.type,
    name: s.name,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    parentId: s.parentId,
  };
  if (s.type === 'text') {
    const content = (s as TextShape).content;
    out['content'] =
      content.length > COMPACT_CONTENT_LIMIT
        ? `${content.slice(0, COMPACT_CONTENT_LIMIT)}…`
        : content;
  }
  if (s.type === 'frame') {
    const layoutMode = (s as FrameShape).layoutMode;
    if (layoutMode && layoutMode !== 'none') out['layoutMode'] = layoutMode;
  }
  if ('fills' in s && Array.isArray(s.fills)) {
    const fill = (s.fills as Fill[]).find((f) => f.visible !== false);
    if (fill) {
      out['fill'] = fill.gradient ? 'gradient' : fill.imageSrc ? 'image' : fill.color;
    }
  }
  if (s.visible === false) out['visible'] = false;
  return out;
}

function textMatches(shape: TextShape, needle: string): boolean {
  if (shape.content.toLowerCase().includes(needle)) return true;
  return (shape.segments ?? []).some((segment) => segment.text.toLowerCase().includes(needle));
}

function unknownPropWarnings(type: string, props: Record<string, unknown>): string[] {
  const known = getShapeKnownKeys(type);
  if (!known) return [];
  const warnings: string[] = [];
  for (const key of Object.keys(props)) {
    if (!known.has(key)) {
      warnings.push(`unknown prop "${key}" for ${type} shape (applied anyway; check for typos)`);
    }
  }
  return warnings;
}

function withWarnings<T extends Record<string, unknown>>(result: T, warnings: string[]): T {
  if (warnings.length === 0) return result;
  return { ...result, warnings };
}

interface IconOverrides {
  iconName?: string;
  iconSize?: number;
  iconStrokeWidth?: number;
  iconColor?: string;
}

interface BatchCreateEntry extends IconOverrides {
  type: string;
  props?: Record<string, unknown>;
  childIndex?: number;
  children?: BatchCreateEntry[];
}

function applyIconOverrides(
  type: ShapeType,
  overrides: IconOverrides,
  props: Record<string, unknown>,
): ShapeType {
  if (!overrides.iconName) return type;
  const iconSize = overrides.iconSize ?? (props['width'] as number) ?? 24;
  const svg = getIconSvg(
    overrides.iconName,
    iconSize,
    overrides.iconStrokeWidth ?? 2,
    overrides.iconColor ?? '#000000',
  );
  if (svg) {
    props['svgContent'] = svg;
    props['width'] = props['width'] ?? iconSize;
    props['height'] = props['height'] ?? iconSize;
    props['name'] = props['name'] ?? `icon-${overrides.iconName}`;
  }
  return 'svg';
}

export function shapeHandlers(): Record<string, RpcHandler> {
  return {
    create_shape(ydoc, args) {
      let rawProps = sanitizeColorVars({ ...((args['props'] ?? {}) as Record<string, unknown>) });
      const type = applyIconOverrides(
        args['type'] as ShapeType,
        {
          iconName: args['iconName'] as string | undefined,
          iconSize: args['iconSize'] as number | undefined,
          iconStrokeWidth: args['iconStrokeWidth'] as number | undefined,
          iconColor: args['iconColor'] as string | undefined,
        },
        rawProps,
      );
      if (type === 'text') rawProps = applyTextDefaults(rawProps);
      const warnings = unknownPropWarnings(type, rawProps);
      const props = toAbsoluteProps(ydoc, rawProps);
      const idx = args['childIndex'] as number | undefined;
      const id = opCreateShape(ydoc, type, props as Partial<Shape>, idx);
      return withWarnings({ shapeId: id }, warnings);
    },

    get_shape(ydoc, args) {
      const shape = getShape(ydoc, args['shapeId'] as string);
      if (!shape) return { error: 'Shape not found' };
      return toRelativeShape(ydoc, shape);
    },

    update_shape(ydoc, args) {
      const shapeId = args['shapeId'] as string;
      const rawProps = sanitizeColorVars(args['props'] as Record<string, unknown>);
      const shape = getShape(ydoc, shapeId);
      if (!shape) return { error: 'Shape not found' };
      const warnings = unknownPropWarnings(shape.type, rawProps);
      const props = (
        shape.parentId && (typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number')
          ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
          : rawProps
      ) as Partial<Shape>;
      opUpdateShape(ydoc, shapeId, props);
      return withWarnings({ ok: true }, warnings);
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

    find_shapes(ydoc, args) {
      const query = args['query'] as string | undefined;
      const type = args['type'] as string | undefined;
      const text = args['text'] as string | undefined;
      const parentId = args['parentId'] as string | undefined;
      const limit = Math.min(Math.max((args['limit'] as number | undefined) ?? 50, 1), 200);
      const offset = Math.max((args['offset'] as number | undefined) ?? 0, 0);

      if (!query && !type && !text) {
        return { error: 'Provide at least one of query, type, or text' };
      }

      const allShapes = getAllShapes(ydoc);
      const scope = parentId
        ? collectShapesWithDescendants(allShapes, [parentId]).filter(
            (shape) => shape.id !== parentId,
          )
        : allShapes;

      const nameNeedle = query?.toLowerCase();
      const textNeedle = text?.toLowerCase();
      const matches = scope.filter((shape) => {
        if (type && shape.type !== type) return false;
        if (nameNeedle && !shape.name.toLowerCase().includes(nameNeedle)) return false;
        if (textNeedle) {
          if (shape.type !== 'text') return false;
          if (!textMatches(shape as TextShape, textNeedle)) return false;
        }
        return true;
      });

      const page = matches
        .slice(offset, offset + limit)
        .map((shape) => compactShape(toRelativeShape(ydoc, shape)));
      return { matches: page, total: matches.length };
    },

    batch_create_shapes(ydoc, args) {
      const entries = args['shapes'] as BatchCreateEntry[];
      const flat: Array<{ entry: BatchCreateEntry; parentRef?: number }> = [];
      const flatten = (entry: BatchCreateEntry, parentRef?: number) => {
        const index = flat.length;
        flat.push({ entry, parentRef });
        for (const child of entry.children ?? []) flatten(child, index);
      };
      for (const entry of entries) flatten(entry);

      if (flat.length > MAX_BATCH_CREATE_NODES) {
        return { error: `Too many shapes: ${flat.length} (max ${MAX_BATCH_CREATE_NODES})` };
      }

      const items: BatchCreateItem[] = [];
      const warnings: string[] = [];
      for (const [index, { entry, parentRef }] of flat.entries()) {
        let props = sanitizeColorVars({ ...(entry.props ?? {}) });
        let resolvedParentRef = parentRef;
        const parentId = props['parentId'];
        if (
          resolvedParentRef === undefined &&
          typeof parentId === 'string' &&
          parentId.startsWith('$')
        ) {
          const refIdx = Number.parseInt(parentId.slice(1), 10);
          if (!Number.isInteger(refIdx) || refIdx < 0 || refIdx >= index) {
            return {
              error: `Invalid parentId reference "${parentId}" at shape ${index}: "$N" must point to an earlier shape in the batch`,
            };
          }
          delete props['parentId'];
          resolvedParentRef = refIdx;
        }

        const type = applyIconOverrides(entry.type as ShapeType, entry, props);
        if (type === 'text') props = applyTextDefaults(props);
        for (const warning of unknownPropWarnings(type, props)) {
          warnings.push(`shape ${index}: ${warning}`);
        }
        if (resolvedParentRef === undefined) props = toAbsoluteProps(ydoc, props);

        items.push({
          type,
          props: props as Partial<Shape>,
          childIndex: entry.childIndex,
          parentRef: resolvedParentRef,
        });
      }

      const ids = opBatchCreateShapes(ydoc, items);
      return withWarnings({ shapeIds: ids, count: ids.length }, warnings);
    },

    batch_update_shapes(ydoc, args) {
      const updates = args['updates'] as Array<{
        shapeId: string;
        props: Record<string, unknown>;
      }>;
      const results: Array<{ shapeId: string; ok: boolean; error?: string }> = [];
      const valid: Array<{ shapeId: string; props: Partial<Shape> }> = [];
      const warnings: string[] = [];

      for (const update of updates) {
        const shape = getShape(ydoc, update.shapeId);
        if (!shape) {
          results.push({ shapeId: update.shapeId, ok: false, error: 'Shape not found' });
          continue;
        }
        const rawProps = sanitizeColorVars(update.props);
        for (const warning of unknownPropWarnings(shape.type, rawProps)) {
          warnings.push(`${update.shapeId}: ${warning}`);
        }
        const props =
          typeof rawProps['x'] === 'number' || typeof rawProps['y'] === 'number'
            ? shape.parentId
              ? toAbsoluteProps(ydoc, { parentId: shape.parentId, ...rawProps })
              : rawProps
            : rawProps;
        valid.push({ shapeId: update.shapeId, props: props as Partial<Shape> });
        results.push({ shapeId: update.shapeId, ok: true });
      }

      if (valid.length > 0) opBatchUpdateShapes(ydoc, valid);
      return withWarnings({ ok: results.every((result) => result.ok), results }, warnings);
    },
  };
}
