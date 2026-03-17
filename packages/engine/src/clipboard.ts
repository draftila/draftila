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
import { shapesToSvg } from './figma-clipboard';

const DUPLICATE_OFFSET = 20;

let clipboardShapes: Shape[] = [];
let clipboardStyle: Record<string, unknown> | null = null;

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

interface PasteOptions {
  selectedIds?: string[];
  cursorPosition?: Point | null;
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

  try {
    const json = JSON.stringify({ type: 'draftila/shapes', shapes });
    const svg = shapesToSvg(shapes);
    const htmlContent = `${svg}\n<!-- draftila:${btoa(json)} -->`;

    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([json], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    try {
      const json = JSON.stringify({ type: 'draftila/shapes', shapes });
      navigator.clipboard.writeText(json);
    } catch {
      // Clipboard API may not be available
    }
  }

  return shapes;
}

export function pasteShapes(ydoc: Y.Doc, options: PasteOptions = {}): string[] {
  if (clipboardShapes.length === 0) return [];

  const { selectedIds, cursorPosition } = options;
  const targetParentId = selectedIds ? getSelectedContainer(ydoc, selectedIds) : null;

  const clipboardById = new Map<string, Shape>(clipboardShapes.map((shape) => [shape.id, shape]));
  const topLevelShapes = clipboardShapes.filter(
    (shape) => !shape.parentId || !clipboardById.has(shape.parentId),
  );

  let offsetX: number;
  let offsetY: number;

  if (cursorPosition) {
    const bounds = getClipboardBounds(clipboardShapes, clipboardById);
    offsetX = cursorPosition.x - bounds.centerX;
    offsetY = cursorPosition.y - bounds.centerY;
  } else {
    offsetX = DUPLICATE_OFFSET;
    offsetY = DUPLICATE_OFFSET;
  }

  const oldToNewIds = new Map<string, string>();
  const newIds: string[] = [];

  for (const shape of clipboardShapes) {
    const isTopLevel = !shape.parentId || !clipboardById.has(shape.parentId);
    const parentId = isTopLevel ? targetParentId : (oldToNewIds.get(shape.parentId!) ?? null);
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
  return style;
}

export function pasteStyle(ydoc: Y.Doc, ids: string[]): string[] {
  if (!clipboardStyle || ids.length === 0) return [];

  const updatedIds: string[] = [];

  for (const id of ids) {
    const targetShape = getShape(ydoc, id);
    if (!targetShape) continue;
    const target = targetShape as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    for (const key of STYLE_KEYS) {
      if (!(key in clipboardStyle)) continue;
      if (!(key in target)) continue;
      const value = clipboardStyle[key];
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
