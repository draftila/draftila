import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  addShape,
  deleteShapes,
  getAllShapes,
  getExpandedShapeIds,
  getTopLevelSelectedShapeIds,
} from './scene-graph';
import { shapesToSvg } from './figma-clipboard';

const PASTE_OFFSET = 20;

let clipboardShapes: Shape[] = [];

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

export function pasteShapes(ydoc: Y.Doc): string[] {
  if (clipboardShapes.length === 0) return [];

  const clipboardById = new Map<string, Shape>(clipboardShapes.map((shape) => [shape.id, shape]));
  const topLevelShapes = clipboardShapes.filter(
    (shape) => !shape.parentId || !clipboardById.has(shape.parentId),
  );

  const oldToNewIds = new Map<string, string>();
  const newIds: string[] = [];

  for (const shape of clipboardShapes) {
    const parentId = shape.parentId ? (oldToNewIds.get(shape.parentId) ?? null) : null;
    const { id: _id, ...rest } = shape;
    const newId = addShape(ydoc, shape.type, {
      ...rest,
      parentId,
      x: shape.x + PASTE_OFFSET,
      y: shape.y + PASTE_OFFSET,
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

  clipboardShapes = clipboardShapes.map((s) => ({
    ...s,
    x: s.x + PASTE_OFFSET,
    y: s.y + PASTE_OFFSET,
  }));

  return newIds;
}

export function cutShapes(ydoc: Y.Doc, ids: string[]): Shape[] {
  const shapes = copyShapes(ydoc, ids);
  deleteShapes(ydoc, ids);
  return shapes;
}

export function duplicateShapes(ydoc: Y.Doc, ids: string[]): string[] {
  copyShapes(ydoc, ids);
  return pasteShapes(ydoc);
}

export function hasClipboardContent(): boolean {
  return clipboardShapes.length > 0;
}
