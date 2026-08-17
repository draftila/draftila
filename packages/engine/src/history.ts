import * as Y from 'yjs';
import { getShapesMap, getZOrder } from './scene-graph';
import { getActivePageGuidesArray } from './guides';

let undoManager: Y.UndoManager | null = null;

export function initUndoManager(ydoc: Y.Doc): Y.UndoManager {
  const guides = getActivePageGuidesArray(ydoc);
  type UndoScope = ConstructorParameters<typeof Y.UndoManager>[0];
  const scope = [
    getShapesMap(ydoc),
    getZOrder(ydoc),
    ydoc.getMap('variables'),
  ] as unknown as UndoScope & unknown[];
  if (guides) scope.push(guides);

  undoManager = new Y.UndoManager(scope, {
    captureTimeout: 500,
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
