import * as Y from 'yjs';
import type { Fill, Gradient, Shape, TextSegment } from '@draftila/shared';
import { ymapToObject, valueToYjs } from './scene-graph/yjs-utils';
import {
  buildVariableTable,
  resolveColorRef,
  collectShapeVariableRefs,
  type VariableTable,
} from './variables';

/** Shape keys that can hold a colour binding. */
const COLOR_ARRAY_KEYS = ['fills', 'strokes', 'shadows', 'guides', 'segments'] as const;

type ShapeVisitor = (shape: Shape) => Shape | null;

/**
 * Walk every shape in the document, not just the active page.
 *
 * `getShapesMap` resolves to the *active* page (`getActivePageShapesMap`), which
 * is the wrong scope for document-wide operations — and on the API server, where
 * these run, `ensureDefaultPage` has never executed, so the active page is
 * whatever `ensureActivePage` happens to pick. This walks the raw maps instead.
 *
 * Covers: every page, the legacy top-level `shapes` map (un-migrated documents),
 * and component definitions, which store their shapes as a JSON string rather
 * than as Yjs structures.
 *
 * Returns the number of shapes the visitor changed.
 */
export function forEachShapeAcrossPages(ydoc: Y.Doc, visit: ShapeVisitor): number {
  let changed = 0;

  const visitShapesMap = (shapes: Y.Map<Y.Map<unknown>>) => {
    shapes.forEach((shapeData) => {
      const shape = ymapToObject(shapeData) as Shape;
      const next = visit(shape);
      if (!next) return;
      for (const key of COLOR_ARRAY_KEYS) {
        const value = (next as unknown as Record<string, unknown>)[key];
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

  // Legacy documents keep shapes at the root until a client migrates them.
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
      const updated = visit(shape);
      if (!updated) return shape;
      componentChanged = true;
      changed++;
      return updated;
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

/**
 * Replace every reference to `variableId` with the value it currently resolves
 * to, then drop the binding. Inlining the *resolved* value (not the stale
 * literal) is what makes deleting a global visually lossless.
 */
export function detachVariableFromShape(
  shape: Shape,
  variableId: string,
  table: VariableTable,
): Shape | null {
  // Work through an untyped record: `Shape` is a discriminated union, so
  // assigning back into a spread of it produces an intersection of every
  // member's array types.
  const styled = shape as unknown as {
    fills?: Fill[];
    strokes?: Array<{ color: string; colorVar?: string }>;
    shadows?: Array<{ color: string; colorVar?: string }>;
    guides?: Array<{ color: string; colorVar?: string }>;
    segments?: TextSegment[];
  };
  const next: Record<string, unknown> = { ...shape };
  let changed = false;

  if (styled.fills) {
    next.fills = styled.fills.map((fill) => {
      const detached = detachItem(fill, variableId, table) ?? fill;
      const gradient = detached.gradient
        ? detachGradient(detached.gradient, variableId, table)
        : null;
      if (detached !== fill || gradient) changed = true;
      return gradient ? { ...detached, gradient } : detached;
    });
  }

  if (styled.segments) {
    next.segments = styled.segments.map((segment) => {
      const detached = detachItem(segment, variableId, table) ?? segment;
      const gradient = detached.gradient
        ? detachGradient(detached.gradient, variableId, table)
        : null;
      if (detached !== segment || gradient) changed = true;
      return gradient ? { ...detached, gradient } : detached;
    });
  }

  const detachAll = <T extends { color: string; colorVar?: string }>(items: T[]): T[] =>
    items.map((item) => {
      const detached = detachItem(item, variableId, table);
      if (!detached) return item;
      changed = true;
      return detached;
    });

  if (styled.strokes) next.strokes = detachAll(styled.strokes);
  if (styled.shadows) next.shadows = detachAll(styled.shadows);
  if (styled.guides) next.guides = detachAll(styled.guides);

  return changed ? (next as unknown as Shape) : null;
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

/** Inline a variable everywhere it is used, leaving the variable itself intact. */
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

/**
 * Detach first, then remove — so no shape visibly changes colour.
 *
 * Not atomic against concurrent edits: a peer binding to this variable while the
 * sweep runs can win last-writer on that shape's array and leave a live
 * reference to a deleted variable. That is a supported state — the reference
 * falls back to its literal.
 */
export function deleteVariable(ydoc: Y.Doc, variableId: string): boolean {
  const map = ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>;
  if (!map.has(variableId)) return false;
  ydoc.transact(() => {
    detachVariable(ydoc, variableId);
    map.delete(variableId);
  });
  return true;
}
