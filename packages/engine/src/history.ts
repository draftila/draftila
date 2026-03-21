import * as Y from 'yjs';
import { getShapesMap, getZOrder } from './scene-graph';
import { getActivePageGuidesArray } from './guides';

let undoManager: Y.UndoManager | null = null;

export function initUndoManager(ydoc: Y.Doc): Y.UndoManager {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const guides = getActivePageGuidesArray(ydoc);

  undoManager = new Y.UndoManager([shapes, zOrder, guides], {
    captureTimeout: 300,
  });

  return undoManager;
}

export function undo() {
  undoManager?.undo();
}

export function redo() {
  undoManager?.redo();
}

export function canUndo(): boolean {
  return (undoManager?.undoStack.length ?? 0) > 0;
}

export function canRedo(): boolean {
  return (undoManager?.redoStack.length ?? 0) > 0;
}

export function destroyUndoManager() {
  undoManager?.destroy();
  undoManager = null;
}
