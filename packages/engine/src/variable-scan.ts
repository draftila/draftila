import * as Y from 'yjs';
import type { Fill, Gradient, Shape, TextSegment } from '@draftila/shared';
import { ymapToObject, valueToYjs } from './scene-graph/yjs-utils';
import { getShapesMap } from './scene-graph/hierarchy';
import {
  buildVariableTable,
  getVariable,
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

export type BindTarget = 'fill' | 'stroke';

const TARGET_KEYS: Record<BindTarget, ColorArrayKey> = {
  fill: 'fills',
  stroke: 'strokes',
};

export interface BindResult {
  ok: boolean;
  error?: string;
  resolvedColor?: string;
}

function getItemMap(
  ydoc: Y.Doc,
  shapeId: string,
  target: BindTarget,
  index: number,
): { item: Y.Map<unknown> } | { error: string } {
  const shapeData = getShapesMap(ydoc).get(shapeId);
  if (!shapeData) return { error: `Shape "${shapeId}" not found on the active page` };

  const key = TARGET_KEYS[target];
  const arr = shapeData.get(key) as Y.Array<Y.Map<unknown>> | undefined;
  if (!arr || arr.length === 0) return { error: `Shape "${shapeId}" has no ${key}` };
  if (index < 0 || index >= arr.length) {
    return { error: `${key}[${index}] is out of range — the shape has ${arr.length}` };
  }

  const item = arr.get(index);
  if (!(item instanceof Y.Map)) return { error: `${key}[${index}] is not an object` };
  return { item };
}

/**
 * Writes the binding directly onto the addressed item's Y.Map.
 *
 * Deliberately not routed through `updateShape`, which rebuilds the whole
 * Y.Array for the key: that resolves last-writer-wins against a collaborator
 * editing the same array — the array a user in the colour picker is most likely
 * touching right now — and re-runs `normalizeArrayItem` over untouched
 * siblings, adding defaults and stripping unknown keys from items this call
 * never addressed. A single-key write merges cleanly instead.
 */
export function bindShapeColorVar(
  ydoc: Y.Doc,
  shapeId: string,
  target: BindTarget,
  index: number,
  variableId: string,
): BindResult {
  const variable = getVariable(ydoc, variableId);
  if (!variable) {
    const available = getVariablesSummary(ydoc);
    return {
      ok: false,
      error: `No global with id "${variableId}". Available: ${available || '(none)'}`,
    };
  }

  const found = getItemMap(ydoc, shapeId, target, index);
  if ('error' in found) return { ok: false, error: found.error };
  const { item } = found;

  if (target === 'fill') {
    if (typeof item.get('imageSrc') === 'string' && item.get('imageSrc')) {
      return {
        ok: false,
        error: `fills[${index}] is an image fill; a colour binding would only show if the image fails to load`,
      };
    }
    if (item.get('gradient') !== undefined) {
      return {
        ok: false,
        error: `fills[${index}] is a gradient; a fill-level colorVar is ignored. Bind a stop instead with update_shape: fills[${index}].gradient.stops[i].colorVar`,
      };
    }
  }

  ydoc.transact(() => item.set('colorVar', variableId));

  const literal = item.get('color') as string | undefined;
  return {
    ok: true,
    resolvedColor: resolveColorRef(literal, variableId, buildVariableTable(ydoc)),
  };
}

/**
 * Inlines the currently-resolved colour, then drops the binding — matching the
 * editor's Detach, so the shape does not change colour.
 */
export function unbindShapeColorVar(
  ydoc: Y.Doc,
  shapeId: string,
  target: BindTarget,
  index: number,
): BindResult {
  const found = getItemMap(ydoc, shapeId, target, index);
  if ('error' in found) return { ok: false, error: found.error };
  const { item } = found;

  const variableId = item.get('colorVar') as string | undefined;
  if (!variableId) return { ok: true, resolvedColor: item.get('color') as string | undefined };

  const literal = item.get('color') as string | undefined;
  const resolved = resolveColorRef(literal, variableId, buildVariableTable(ydoc));

  ydoc.transact(() => {
    // A fill may legally carry only a colorVar. Dropping the binding without a
    // literal would leave it with neither, which renders nothing — so fall back
    // to the schema default rather than producing an unpaintable fill.
    item.set('color', resolved ?? literal ?? '#000000');
    item.delete('colorVar');
  });

  return { ok: true, resolvedColor: resolved ?? literal ?? '#000000' };
}

function getVariablesSummary(ydoc: Y.Doc): string {
  const map = ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>;
  const parts: string[] = [];
  map.forEach((data, id) => parts.push(`${id} (${(data.get('name') as string) ?? ''})`));
  return parts.join(', ');
}

/**
 * Every variable's usage in one walk, with the shape ids that reference it.
 *
 * Kept separate from `countVariableUsage`: that counts a shape once per visit,
 * and `forEachShapeAcrossPages` visits component blobs, which snapshot canvas
 * shapes under their original ids — so the count double-counts where a deduped
 * id set would not. Redefining one over the other would silently change the
 * number the Globals panel shows.
 */
export function collectVariableUsage(
  ydoc: Y.Doc,
): Map<string, { shapeIds: string[]; pageIds: string[] }> {
  const usage = new Map<string, { shapeIds: Set<string>; pageIds: Set<string> }>();
  const entry = (id: string) => {
    let e = usage.get(id);
    if (!e) {
      e = { shapeIds: new Set(), pageIds: new Set() };
      usage.set(id, e);
    }
    return e;
  };

  forEachShapeAcrossPages(ydoc, (shape) => {
    for (const variableId of collectShapeVariableRefs(shape)) {
      entry(variableId).shapeIds.add(shape.id);
    }
    return null;
  });

  const pages = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  pages.forEach((page, pageId) => {
    const variableId = page.get('backgroundColorVar');
    if (typeof variableId === 'string') entry(variableId).pageIds.add(pageId);
  });

  return new Map(
    [...usage].map(([id, e]) => [id, { shapeIds: [...e.shapeIds], pageIds: [...e.pageIds] }]),
  );
}
