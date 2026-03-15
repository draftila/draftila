import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getShape, addShape, deleteShapes } from './scene-graph';
import { shapesToSvg, handlePaste as handleFigmaPaste } from './figma-clipboard';

const PASTE_OFFSET = 20;

let clipboardShapes: Shape[] = [];

export function copyShapes(ydoc: Y.Doc, ids: string[]): Shape[] {
  const shapes: Shape[] = [];
  for (const id of ids) {
    const shape = getShape(ydoc, id);
    if (shape) shapes.push(shape);
  }
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

  const newIds: string[] = [];

  for (const shape of clipboardShapes) {
    const { id: _id, ...rest } = shape;
    const newId = addShape(ydoc, shape.type, {
      ...rest,
      x: shape.x + PASTE_OFFSET,
      y: shape.y + PASTE_OFFSET,
      name: shape.name,
    });
    newIds.push(newId);
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
