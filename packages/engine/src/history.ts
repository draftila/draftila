import * as Y from 'yjs';
import { getShapesMap, getZOrder } from './scene-graph';
import { getActivePageGuidesArray } from './guides';

let undoManager: Y.UndoManager | null = null;

export function initUndoManager(ydoc: Y.Doc): Y.UndoManager {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const guides = getActivePageGuidesArray(ydoc);
  // Editing a global would otherwise be the only un-undoable action in the
  // editor. Note the shapes map is active-page scoped, so a cross-page detach
  // sweep is still only partially undoable — see the delete confirmation.
  const variables = ydoc.getMap('variables');

  undoManager = new Y.UndoManager([shapes, zOrder, guides, variables], {
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
