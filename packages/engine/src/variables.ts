import * as Y from 'yjs';
import type { Fill, Gradient, LayoutGuide, Shadow, Shape, Stroke, TextSegment } from '@draftila/shared';
import { variableColorSchema } from '@draftila/shared';
import { getAllShapes } from './scene-graph';
import {
  DEFAULT_PAGE_BACKGROUND,
  getPageBackgroundColor,
  getPageBackgroundColorVar,
} from './pages';

export type { Variable } from '@draftila/shared';
import type { Variable } from '@draftila/shared';

/** varId -> validated 6-digit hex. Built fresh per resolution pass; never cached. */
export type VariableTable = Map<string, string>;

const DEFAULT_VARIABLE_VALUE = '#000000';

function getVariablesMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>;
}

/**
 * Coerce a stored variable value to `#RRGGBB`.
 *
 * `setVariable` shipped without validation, so existing drafts may hold 8-digit,
 * 3-digit or named values. Values also arrive over the collaboration websocket,
 * which cannot be validated at write time at all — so this runs on read, which
 * is the only choke point every resolving consumer passes through. It is also
 * what keeps unvalidated bytes out of the SVG generator's colour sinks.
 */
export function normalizeVariableValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (variableColorSchema.safeParse(trimmed).success) return trimmed.toUpperCase();
  // Tolerate the two shapes we know are already in the wild.
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7).toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = [trimmed[1]!, trimmed[2]!, trimmed[3]!];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

export function getVariables(ydoc: Y.Doc): Variable[] {
  const map = getVariablesMap(ydoc);
  const result: Variable[] = [];
  for (const [id, data] of map) {
    result.push({
      id,
      name: (data.get('name') as string) ?? '',
      type: 'color',
      value: normalizeVariableValue(data.get('value')) ?? DEFAULT_VARIABLE_VALUE,
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

export function getVariable(ydoc: Y.Doc, id: string): Variable | null {
  const data = getVariablesMap(ydoc).get(id);
  if (!data) return null;
  return {
    id,
    name: (data.get('name') as string) ?? '',
    type: 'color',
    value: normalizeVariableValue(data.get('value')) ?? DEFAULT_VARIABLE_VALUE,
  };
}

function generateVariableId(): string {
  return `var_${crypto.randomUUID().slice(0, 8)}`;
}

export function createVariable(ydoc: Y.Doc, name: string, value: string): Variable {
  const id = generateVariableId();
  return setVariable(ydoc, id, name, value);
}

export function setVariable(ydoc: Y.Doc, id: string, name: string, value: string): Variable {
  const map = getVariablesMap(ydoc);
  const normalized = normalizeVariableValue(value) ?? DEFAULT_VARIABLE_VALUE;
  ydoc.transact(() => {
    const existing = map.get(id);
    if (existing) {
      existing.set('name', name);
      existing.set('value', normalized);
    } else {
      const entry = new Y.Map<unknown>();
      entry.set('name', name);
      entry.set('type', 'color');
      entry.set('value', normalized);
      map.set(id, entry);
    }
  });
  return { id, name, type: 'color', value: normalized };
}

export function setVariableValue(ydoc: Y.Doc, id: string, value: string): Variable | null {
  const existing = getVariable(ydoc, id);
  if (!existing) return null;
  return setVariable(ydoc, id, existing.name, value);
}

export function renameVariable(ydoc: Y.Doc, id: string, name: string): Variable | null {
  const existing = getVariable(ydoc, id);
  if (!existing) return null;
  return setVariable(ydoc, id, name, existing.value);
}

export function buildVariableTable(ydoc: Y.Doc): VariableTable {
  const table: VariableTable = new Map();
  for (const [id, data] of getVariablesMap(ydoc)) {
    const value = normalizeVariableValue(data.get('value'));
    if (value) table.set(id, value);
  }
  return table;
}

export function observeVariables(ydoc: Y.Doc, callback: (variables: Variable[]) => void): () => void {
  const map = getVariablesMap(ydoc);
  const handler = () => callback(getVariables(ydoc));
  map.observeDeep(handler);
  return () => map.unobserveDeep(handler);
}

/**
 * Resolve one colour reference.
 *
 * The variable supplies RGB only; whatever alpha the local literal carried is
 * preserved. Shadows and layout guides bake their opacity into the hex and have
 * no separate opacity field, so dropping it would silently disable their opacity
 * controls. Fills and strokes have a real `opacity` field, where the preserved
 * alpha is a harmless no-op.
 *
 * A missing variable falls back to the literal — dangling references are a
 * supported state, not an error.
 */
export function resolveColorRef(
  literal: string | undefined,
  varId: string | undefined,
  table: VariableTable,
): string | undefined {
  if (!varId) return literal;
  const value = table.get(varId);
  if (!value) return literal;
  // `#RRGGBBAA` is 9 chars. colorSchema also admits 7, so test the length explicitly.
  if (literal && literal.length === 9) return `${value}${literal.slice(7)}`;
  return value;
}

function resolveGradient(gradient: Gradient, table: VariableTable): Gradient | null {
  let changed = false;
  const stops = gradient.stops.map((stop) => {
    const color = resolveColorRef(stop.color, stop.colorVar, table);
    if (color === stop.color) return stop;
    changed = true;
    return { ...stop, color: color ?? stop.color };
  });
  return changed ? ({ ...gradient, stops } as Gradient) : null;
}

function resolveFill(fill: Fill, table: VariableTable): Fill | null {
  const color = resolveColorRef(fill.color, fill.colorVar, table);
  const gradient = fill.gradient ? resolveGradient(fill.gradient, table) : null;
  if (color === fill.color && !gradient) return null;
  const next: Fill = { ...fill };
  if (color !== undefined) next.color = color;
  if (gradient) next.gradient = gradient;
  return next;
}

function resolveSegment(segment: TextSegment, table: VariableTable): TextSegment | null {
  const color = resolveColorRef(segment.color, segment.colorVar, table);
  const gradient = segment.gradient ? resolveGradient(segment.gradient, table) : null;
  if (color === segment.color && !gradient) return null;
  const next: TextSegment = { ...segment };
  if (color !== undefined) next.color = color;
  if (gradient) next.gradient = gradient;
  return next;
}

function resolveSimple<T extends { color: string; colorVar?: string }>(
  item: T,
  table: VariableTable,
): T | null {
  const color = resolveColorRef(item.color, item.colorVar, table);
  if (color === item.color || color === undefined) return null;
  return { ...item, color };
}

function mapResolved<T>(items: T[] | undefined, resolve: (item: T) => T | null): T[] | null {
  if (!items || items.length === 0) return null;
  let changed = false;
  const next = items.map((item) => {
    const resolved = resolve(item);
    if (!resolved) return item;
    changed = true;
    return resolved;
  });
  return changed ? next : null;
}

type StyledShape = Shape & {
  fills?: Fill[];
  strokes?: Stroke[];
  shadows?: Shadow[];
  guides?: LayoutGuide[];
  segments?: TextSegment[];
};

/**
 * Returns the same object reference when the shape carries no bindings, so an
 * unbound document pays only a shallow scan.
 */
export function resolveShapeColors(table: VariableTable, shape: Shape): Shape {
  if (table.size === 0) return shape;
  const styled = shape as StyledShape;

  const fills = mapResolved(styled.fills, (fill) => resolveFill(fill, table));
  const strokes = mapResolved(styled.strokes, (stroke) => resolveSimple(stroke, table));
  const shadows = mapResolved(styled.shadows, (shadow) => resolveSimple(shadow, table));
  const guides = mapResolved(styled.guides, (guide) => resolveSimple(guide, table));
  const segments = mapResolved(styled.segments, (segment) => resolveSegment(segment, table));

  if (!fills && !strokes && !shadows && !guides && !segments) return shape;

  const next = { ...styled } as StyledShape;
  if (fills) next.fills = fills;
  if (strokes) next.strokes = strokes;
  if (shadows) next.shadows = shadows;
  if (guides) next.guides = guides;
  if (segments) next.segments = segments;
  return next as Shape;
}

export function resolveShapesColors(table: VariableTable, shapes: Shape[]): Shape[] {
  if (table.size === 0) return shapes;
  return shapes.map((shape) => resolveShapeColors(table, shape));
}

/** Strip every colour binding from a shape, across the full traversal. */
export function stripShapeColorVars(shape: Shape): Shape {
  const styled = shape as StyledShape;
  const dropVar = <T extends { colorVar?: string }>(item: T): T => {
    if (item.colorVar === undefined) return item;
    const { colorVar: _drop, ...rest } = item;
    return rest as T;
  };
  const dropGradient = (gradient: Gradient): Gradient =>
    ({ ...gradient, stops: gradient.stops.map(dropVar) }) as Gradient;

  const next = { ...styled } as StyledShape;
  let changed = false;

  if (styled.fills) {
    next.fills = styled.fills.map((fill) => {
      const base = dropVar(fill);
      return base.gradient ? { ...base, gradient: dropGradient(base.gradient) } : base;
    });
    changed = true;
  }
  if (styled.strokes) {
    next.strokes = styled.strokes.map(dropVar);
    changed = true;
  }
  if (styled.shadows) {
    next.shadows = styled.shadows.map(dropVar);
    changed = true;
  }
  if (styled.guides) {
    next.guides = styled.guides.map(dropVar);
    changed = true;
  }
  if (styled.segments) {
    next.segments = styled.segments.map((segment) => {
      const base = dropVar(segment);
      return base.gradient ? { ...base, gradient: dropGradient(base.gradient) } : base;
    });
    changed = true;
  }

  return changed ? (next as Shape) : shape;
}

/** Every colour binding a shape carries, across the full traversal. */
export function collectShapeVariableRefs(shape: Shape, into: Set<string> = new Set()): Set<string> {
  const styled = shape as StyledShape;
  const add = (id: string | undefined) => {
    if (id) into.add(id);
  };
  const addGradient = (gradient: Gradient | undefined) => {
    gradient?.stops.forEach((stop) => add(stop.colorVar));
  };

  styled.fills?.forEach((fill) => {
    add(fill.colorVar);
    addGradient(fill.gradient);
  });
  styled.strokes?.forEach((stroke) => add(stroke.colorVar));
  styled.shadows?.forEach((shadow) => add(shadow.colorVar));
  styled.guides?.forEach((guide) => add(guide.colorVar));
  styled.segments?.forEach((segment) => {
    add(segment.colorVar);
    addGradient(segment.gradient);
  });

  return into;
}

export function collectVariableRefs(shapes: Shape[]): Set<string> {
  const refs = new Set<string>();
  for (const shape of shapes) collectShapeVariableRefs(shape, refs);
  return refs;
}

/**
 * The standard entry point for anything that renders, exports or displays
 * shapes. Everything that only needs geometry should keep using `getAllShapes`;
 * anything that touches colour must come through here.
 */
export function getResolvedShapes(ydoc: Y.Doc): Shape[] {
  return resolveShapesColors(buildVariableTable(ydoc), getAllShapes(ydoc));
}

export function getResolvedPageBackgroundColor(ydoc: Y.Doc, pageId: string): string {
  const literal = getPageBackgroundColor(ydoc, pageId);
  const varId = getPageBackgroundColorVar(ydoc, pageId);
  if (!varId) return literal;
  return resolveColorRef(literal, varId, buildVariableTable(ydoc)) ?? DEFAULT_PAGE_BACKGROUND;
}
