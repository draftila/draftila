import * as Y from 'yjs';

let undoManager: Y.UndoManager | null = null;

export function initUndoManager(ydoc: Y.Doc): Y.UndoManager {
  const shapes = ydoc.getMap('shapes');
  const zOrder = ydoc.getArray('zOrder');

  undoManager = new Y.UndoManager([shapes, zOrder], {
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
