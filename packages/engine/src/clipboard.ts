import type * as Y from 'yjs';
import type { Point, Shape } from '@draftila/shared';
import {
  addShape,
  deleteShapes,
  getAllShapes,
  getExpandedShapeIds,
  getShape,
  getSelectedContainer,
  getTopLevelSelectedShapeIds,
  updateShape,
} from './scene-graph';
import { shapesToSvg } from './shape-import';
import { buildVariableTable, resolveShapesColors, stripShapeColorVars } from './variables';
import { getDocId, stripStyleColorVars } from './clipboard-vars';

const DUPLICATE_OFFSET = 20;

let clipboardShapes: Shape[] = [];
let clipboardSourceDocId: string | null = null;
let clipboardStyle: Record<string, unknown> | null = null;
let clipboardStyleSourceDocId: string | null = null;

const STYLE_KEYS: string[] = [
  'fills',
  'strokes',
  'shadows',
  'blurs',
  'opacity',
  'blendMode',
  'cornerRadius',
  'cornerRadiusTL',
  'cornerRadiusTR',
  'cornerRadiusBR',
  'cornerRadiusBL',
  'cornerSmoothing',
  'fillRule',
  'strokeCap',
  'strokeJoin',
  'strokeMiterLimit',
  'strokeAlign',
  'strokeDasharray',
  'strokeDashoffset',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textAlignHorizontal',
  'textAlignVertical',
  'textTransform',
  'textDecoration',
];

function cloneStyleValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface PasteOptions {
  selectedIds?: string[];
  cursorPosition?: Point | null;
  inPlace?: boolean;
}

function getClipboardBounds(shapes: Shape[], clipboardById: Map<string, Shape>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    if (shape.parentId && clipboardById.has(shape.parentId)) continue;
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  return { minX, minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

export function copyShapes(ydoc: Y.Doc, ids: string[]): Shape[] {
  const topLevelIds = getTopLevelSelectedShapeIds(ydoc, ids);
  const expandedIds = new Set(getExpandedShapeIds(ydoc, topLevelIds));
  const shapes = getAllShapes(ydoc).filter((shape) => expandedIds.has(shape.id));
  clipboardShapes = shapes;
  clipboardSourceDocId = getDocId(ydoc);

  try {
    const json = JSON.stringify({
      type: 'draftila/shapes',
      sourceDocId: clipboardSourceDocId,
      shapes,
    });
    const svg = shapesToSvg(resolveShapesColors(buildVariableTable(ydoc), shapes));
    const htmlContent = `${svg}\n<!-- draftila:${btoa(json)} -->`;

    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([json], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    try {
      const json = JSON.stringify({
        type: 'draftila/shapes',
        sourceDocId: clipboardSourceDocId,
        shapes,
      });
      navigator.clipboard.writeText(json);
    } catch {
      // Clipboard API may not be available
    }
  }

  return shapes;
}

export function pasteShapes(ydoc: Y.Doc, options: PasteOptions = {}): string[] {
  if (clipboardShapes.length === 0) return [];

  const foreign = clipboardSourceDocId === null || clipboardSourceDocId !== getDocId(ydoc);
  const sourceShapes = foreign ? clipboardShapes.map(stripShapeColorVars) : clipboardShapes;

  const { selectedIds, cursorPosition, inPlace } = options;
  const targetParentId = selectedIds ? getSelectedContainer(ydoc, selectedIds) : null;

  const clipboardById = new Map<string, Shape>(sourceShapes.map((shape) => [shape.id, shape]));
  const topLevelShapes = sourceShapes.filter(
    (shape) => !shape.parentId || !clipboardById.has(shape.parentId),
  );

  let offsetX: number;
  let offsetY: number;

  if (inPlace) {
    offsetX = 0;
    offsetY = 0;
  } else if (cursorPosition) {
    const bounds = getClipboardBounds(sourceShapes, clipboardById);
    offsetX = cursorPosition.x - bounds.centerX;
    offsetY = cursorPosition.y - bounds.centerY;
  } else {
    offsetX = DUPLICATE_OFFSET;
    offsetY = DUPLICATE_OFFSET;
  }

  const oldToNewIds = new Map<string, string>();
  const newIds: string[] = [];

  for (const shape of sourceShapes) {
    const isTopLevel = !shape.parentId || !clipboardById.has(shape.parentId);
    const parentId = isTopLevel
      ? (targetParentId ?? shape.parentId ?? null)
      : (oldToNewIds.get(shape.parentId!) ?? null);
    const { id: _id, ...rest } = shape;
    const newId = addShape(ydoc, shape.type, {
      ...rest,
      parentId,
      x: shape.x + offsetX,
      y: shape.y + offsetY,
      name: shape.name,
    });
    oldToNewIds.set(shape.id, newId);
  }

  for (const shape of topLevelShapes) {
    const newId = oldToNewIds.get(shape.id);
    if (newId) {
      newIds.push(newId);
    }
  }

  return newIds;
}

export function cutShapes(ydoc: Y.Doc, ids: string[]): Shape[] {
  const shapes = copyShapes(ydoc, ids);
  deleteShapes(ydoc, ids);
  return shapes;
}

export function duplicateShapes(ydoc: Y.Doc, ids: string[]): string[] {
  copyShapes(ydoc, ids);
  return pasteShapes(ydoc, { selectedIds: ids });
}

export function duplicateShapesInPlace(ydoc: Y.Doc, ids: string[]): Map<string, string> {
  const topLevelIds = getTopLevelSelectedShapeIds(ydoc, ids);
  const expandedIds = new Set(getExpandedShapeIds(ydoc, topLevelIds));
  const shapes = getAllShapes(ydoc).filter((shape) => expandedIds.has(shape.id));

  if (shapes.length === 0) return new Map();

  const shapeById = new Map<string, Shape>(shapes.map((shape) => [shape.id, shape]));
  const oldToNewIds = new Map<string, string>();

  for (const shape of shapes) {
    const isTopLevel = !shape.parentId || !shapeById.has(shape.parentId);
    const parentId = isTopLevel ? shape.parentId : (oldToNewIds.get(shape.parentId!) ?? null);
    const { id: _id, ...rest } = shape;
    const newId = addShape(ydoc, shape.type, {
      ...rest,
      parentId,
      name: shape.name,
    });
    oldToNewIds.set(shape.id, newId);
  }

  return oldToNewIds;
}

export function hasClipboardContent(): boolean {
  return clipboardShapes.length > 0;
}

export function copyStyle(ydoc: Y.Doc, shapeId: string): Record<string, unknown> | null {
  const shape = getShape(ydoc, shapeId);
  if (!shape) return null;

  const style: Record<string, unknown> = {};
  const source = shape as Record<string, unknown>;
  for (const key of STYLE_KEYS) {
    if (!(key in source)) continue;
    const value = source[key];
    if (value === undefined) continue;
    style[key] = cloneStyleValue(value);
  }

  clipboardStyle = style;
  clipboardStyleSourceDocId = getDocId(ydoc);
  return style;
}

export function pasteStyle(ydoc: Y.Doc, ids: string[]): string[] {
  if (!clipboardStyle || ids.length === 0) return [];

  const style =
    clipboardStyleSourceDocId !== null && clipboardStyleSourceDocId === getDocId(ydoc)
      ? clipboardStyle
      : stripStyleColorVars(clipboardStyle);

  const updatedIds: string[] = [];

  for (const id of ids) {
    const targetShape = getShape(ydoc, id);
    if (!targetShape) continue;
    const target = targetShape as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    for (const key of STYLE_KEYS) {
      if (!(key in style)) continue;
      if (!(key in target)) continue;
      const value = style[key];
      if (value === undefined) continue;
      patch[key] = cloneStyleValue(value);
    }

    if (Object.keys(patch).length === 0) continue;
    updateShape(ydoc, id, patch as Partial<Shape>);
    updatedIds.push(id);
  }

  return updatedIds;
}

export function hasStyleClipboardContent(): boolean {
  return clipboardStyle !== null;
}
