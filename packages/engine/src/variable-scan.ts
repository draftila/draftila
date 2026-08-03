import * as Y from 'yjs';
import type { Fill, Gradient, Shape, TextSegment } from '@draftila/shared';
import { ymapToObject, valueToYjs } from './scene-graph/yjs-utils';
import {
  buildVariableTable,
  resolveColorRef,
  collectShapeVariableRefs,
  type VariableTable,
} from './variables';

type ColorArrayKey = 'fills' | 'strokes' | 'shadows' | 'guides' | 'segments';

type ShapePatch = Partial<Record<ColorArrayKey, unknown>>;

type ShapeVisitor = (shape: Shape) => ShapePatch | null;

export function forEachShapeAcrossPages(ydoc: Y.Doc, visit: ShapeVisitor): number {
  let changed = 0;

  const visitShapesMap = (shapes: Y.Map<Y.Map<unknown>>) => {
    shapes.forEach((shapeData) => {
      const shape = ymapToObject(shapeData) as Shape;
      const patch = visit(shape);
      if (!patch) return;
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) shapeData.set(key, valueToYjs(key, value));
      }
      changed++;
    });
  };

  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  pages.forEach((page) => {
    const shapes = page.get('shapes') as Y.Map<Y.Map<unknown>> | undefined;
    if (shapes) visitShapesMap(shapes);
  });

  visitShapesMap(ydoc.getMap('shapes') as Y.Map<Y.Map<unknown>>);

  const components = ydoc.getMap('components') as Y.Map<Y.Map<unknown>>;
  components.forEach((component) => {
    const raw = component.get('shapes');
    if (typeof raw !== 'string') return;
    let parsed: Shape[];
    try {
      parsed = JSON.parse(raw) as Shape[];
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    let componentChanged = false;
    const next = parsed.map((shape) => {
      const patch = visit(shape);
      if (!patch) return shape;
      componentChanged = true;
      changed++;
      return { ...shape, ...patch };
    });
    if (componentChanged) component.set('shapes', JSON.stringify(next));
  });

  return changed;
}

function detachItem<T extends { color?: string; colorVar?: string }>(
  item: T,
  variableId: string,
  table: VariableTable,
): T | null {
  if (item.colorVar !== variableId) return null;
  const { colorVar: _drop, ...rest } = item;
  const resolved = resolveColorRef(item.color, variableId, table);
  return (resolved === undefined ? rest : { ...rest, color: resolved }) as T;
}

function detachGradient(
  gradient: Gradient,
  variableId: string,
  table: VariableTable,
): Gradient | null {
  let changed = false;
  const stops = gradient.stops.map((stop) => {
    const next = detachItem(stop, variableId, table);
    if (!next) return stop;
    changed = true;
    return next;
  });
  return changed ? ({ ...gradient, stops } as Gradient) : null;
}

export function detachVariableFromShape(
  shape: Shape,
  variableId: string,
  table: VariableTable,
): ShapePatch | null {
  const styled = shape as unknown as {
    fills?: Fill[];
    strokes?: Array<{ color: string; colorVar?: string }>;
    shadows?: Array<{ color: string; colorVar?: string }>;
    guides?: Array<{ color: string; colorVar?: string }>;
    segments?: TextSegment[];
  };
  const patch: ShapePatch = {};
  let changed = false;

  const withGradients = <T extends { colorVar?: string; color?: string; gradient?: Gradient }>(
    items: T[],
  ): T[] | null => {
    let touched = false;
    const next = items.map((item) => {
      const detached = detachItem(item, variableId, table) ?? item;
      const gradient = detached.gradient
        ? detachGradient(detached.gradient, variableId, table)
        : null;
      if (detached !== item || gradient) touched = true;
      return gradient ? { ...detached, gradient } : detached;
    });
    return touched ? next : null;
  };

  const plain = <T extends { color: string; colorVar?: string }>(items: T[]): T[] | null => {
    let touched = false;
    const next = items.map((item) => {
      const detached = detachItem(item, variableId, table);
      if (!detached) return item;
      touched = true;
      return detached;
    });
    return touched ? next : null;
  };

  const put = (key: ColorArrayKey, value: unknown[] | null) => {
    if (!value) return;
    patch[key] = value;
    changed = true;
  };

  if (styled.fills) put('fills', withGradients(styled.fills));
  if (styled.segments) put('segments', withGradients(styled.segments));
  if (styled.strokes) put('strokes', plain(styled.strokes));
  if (styled.shadows) put('shadows', plain(styled.shadows));
  if (styled.guides) put('guides', plain(styled.guides));

  return changed ? patch : null;
}

export function countVariableUsage(ydoc: Y.Doc, variableId: string): number {
  let count = 0;
  forEachShapeAcrossPages(ydoc, (shape) => {
    if (collectShapeVariableRefs(shape).has(variableId)) count++;
    return null;
  });

  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  pages.forEach((page) => {
    if (page.get('backgroundColorVar') === variableId) count++;
  });

  return count;
}

export function detachVariable(ydoc: Y.Doc, variableId: string): number {
  const table = buildVariableTable(ydoc);
  let changed = 0;

  ydoc.transact(() => {
    changed = forEachShapeAcrossPages(ydoc, (shape) =>
      detachVariableFromShape(shape, variableId, table),
    );

    const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
    pages.forEach((page) => {
      if (page.get('backgroundColorVar') !== variableId) return;
      const resolved = resolveColorRef(
        page.get('backgroundColor') as string | undefined,
        variableId,
        table,
      );
      if (resolved) page.set('backgroundColor', resolved);
      page.delete('backgroundColorVar');
      changed++;
    });
  });

  return changed;
}

export function deleteVariable(ydoc: Y.Doc, variableId: string): boolean {
  const map = ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>;
  if (!map.has(variableId)) return false;
  ydoc.transact(() => {
    detachVariable(ydoc, variableId);
    map.delete(variableId);
  });
  return true;
}
