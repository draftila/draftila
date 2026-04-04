import type * as Y from 'yjs';
import { undo, redo } from '@draftila/engine/history';
import { getAllShapes, getShape, getZOrder } from '@draftila/engine/scene-graph';
import {
  opDeleteShapes,
  opFlipShapes,
  opFrameSelection,
  opGroupShapes,
  opMoveInStack,
  opNudgeShapes,
  opUngroupShapes,
  opUpdateShape,
} from '@draftila/engine/operations';
import { useEditorStore } from '@/stores/editor-store';

function cycleSelection(ydoc: Y.Doc, reverse: boolean): void {
  const { selectedIds, setSelectedIds, setEnteredGroupId } = useEditorStore.getState();
  const baseSelectedId = selectedIds[0] ?? null;
  const allShapes = getAllShapes(ydoc);
  if (allShapes.length === 0) return;
  const zOrder = getZOrder(ydoc).toArray();
  const shapeById = new Map(allShapes.map((shape) => [shape.id, shape]));
  const baseShape = baseSelectedId ? shapeById.get(baseSelectedId) : null;
  const parentId = baseShape?.parentId ?? null;
  const siblingIds = zOrder.filter((id: string) => {
    const shape = shapeById.get(id);
    if (!shape || !shape.visible) return false;
    return shape.parentId === parentId;
  });
  if (siblingIds.length === 0) return;
  const currentIndex = baseSelectedId ? siblingIds.indexOf(baseSelectedId) : -1;
  const delta = reverse ? -1 : 1;
  const nextIndex =
    currentIndex === -1
      ? reverse
        ? siblingIds.length - 1
        : 0
      : (currentIndex + delta + siblingIds.length) % siblingIds.length;
  const nextId = siblingIds[nextIndex];
  if (!nextId) return;
  setSelectedIds([nextId]);
  setEnteredGroupId(null);
}

export function handleShapeKeyDown(e: KeyboardEvent, ydoc: Y.Doc): boolean {
  const isMod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const code = e.code;

  if (useEditorStore.getState().editorMode === 'dev') {
    if (key === 'escape') {
      e.preventDefault();
      const { enteredGroupId, setEnteredGroupId, setSelectedIds } = useEditorStore.getState();
      if (enteredGroupId) {
        const groupShape = getShape(ydoc, enteredGroupId);
        const parentGroupId = groupShape?.parentId ?? null;
        const parentShape = parentGroupId ? getShape(ydoc, parentGroupId) : null;
        const nextEnteredId = parentShape?.type === 'group' ? parentGroupId : null;
        setEnteredGroupId(nextEnteredId);
        setSelectedIds([enteredGroupId]);
        return true;
      }
      useEditorStore.getState().clearSelection();
      return true;
    }
    if (isMod && key === 'a') {
      e.preventDefault();
      const allShapes = getAllShapes(ydoc);
      useEditorStore.getState().setSelectedIds(allShapes.map((s) => s.id));
      return true;
    }
    if (!isMod && code === 'Tab') {
      e.preventDefault();
      cycleSelection(ydoc, e.shiftKey);
      return true;
    }
    return false;
  }

  if (!isMod && e.shiftKey && code === 'KeyR') {
    e.preventDefault();
    const { rulersVisible, setRulersVisible, setGuidesVisible } = useEditorStore.getState();
    const next = !rulersVisible;
    setRulersVisible(next);
    setGuidesVisible(next);
    return true;
  }

  if (!isMod && e.shiftKey && code === 'KeyC') {
    e.preventDefault();
    const { commentsVisible, setCommentsVisible } = useEditorStore.getState();
    setCommentsVisible(!commentsVisible);
    return true;
  }

  if (isMod && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return true;
  }

  if (isMod && key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
    return true;
  }

  if (!isMod && e.shiftKey && code === 'KeyH') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0) {
      opFlipShapes(ydoc, selectedIds, 'horizontal');
    }
    return true;
  }

  if (!isMod && e.shiftKey && code === 'KeyV') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0) {
      opFlipShapes(ydoc, selectedIds, 'vertical');
    }
    return true;
  }

  if (isMod && e.altKey && code === 'KeyG') {
    e.preventDefault();
    const { selectedIds, setSelectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0) {
      const frameId = opFrameSelection(ydoc, selectedIds);
      if (frameId) {
        setSelectedIds([frameId]);
        useEditorStore.getState().setEnteredGroupId(null);
      }
    }
    return true;
  }

  if (isMod && key === 'g' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const { selectedIds, setSelectedIds } = useEditorStore.getState();
    const groupId = opGroupShapes(ydoc, selectedIds);
    if (groupId) {
      setSelectedIds([groupId]);
      useEditorStore.getState().setEnteredGroupId(null);
    }
    return true;
  }

  if (isMod && key === 'g' && e.shiftKey) {
    e.preventDefault();
    const { selectedIds, setSelectedIds } = useEditorStore.getState();
    const childIds = opUngroupShapes(ydoc, selectedIds);
    if (childIds.length > 0) {
      setSelectedIds(childIds);
      useEditorStore.getState().setEnteredGroupId(null);
    }
    return true;
  }

  if (isMod && (code === 'BracketLeft' || code === 'BracketRight')) {
    e.preventDefault();
    const toExtreme = e.altKey || (e.ctrlKey && e.shiftKey && !e.metaKey);
    const direction =
      code === 'BracketRight' ? (toExtreme ? 'front' : 'forward') : toExtreme ? 'back' : 'backward';

    const { selectedIds, setSelectedIds } = useEditorStore.getState();
    const movedIds = opMoveInStack(ydoc, selectedIds, direction);
    if (movedIds.length > 0) {
      setSelectedIds(movedIds);
    }
    return true;
  }

  if (isMod && key === 'a') {
    e.preventDefault();
    const allShapes = getAllShapes(ydoc);
    useEditorStore.getState().setSelectedIds(allShapes.map((s) => s.id));
    return true;
  }

  if (isMod && e.shiftKey && code === 'KeyL') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length === 0) return true;

    const selectedShapes = selectedIds
      .map((id) => getShape(ydoc, id))
      .filter((shape): shape is NonNullable<typeof shape> => shape !== null);

    if (selectedShapes.length === 0) return true;

    const shouldLock = selectedShapes.some((shape) => !shape.locked);
    for (const shape of selectedShapes) {
      opUpdateShape(ydoc, shape.id, { locked: shouldLock });
    }
    return true;
  }

  if (isMod && e.shiftKey && code === 'KeyH') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length === 0) return true;

    const selectedShapes = selectedIds
      .map((id) => getShape(ydoc, id))
      .filter((shape): shape is NonNullable<typeof shape> => shape !== null);

    if (selectedShapes.length === 0) return true;

    const shouldShow = selectedShapes.some((shape) => !shape.visible);
    for (const shape of selectedShapes) {
      opUpdateShape(ydoc, shape.id, { visible: shouldShow });
    }
    return true;
  }

  if (!isMod && code === 'Tab') {
    e.preventDefault();
    cycleSelection(ydoc, e.shiftKey);
    return true;
  }

  if (key === 'delete' || key === 'backspace') {
    e.preventDefault();
    const { selectedIds, enteredGroupId } = useEditorStore.getState();
    if (selectedIds.length > 0) {
      if (enteredGroupId && selectedIds.includes(enteredGroupId)) {
        useEditorStore.getState().setEnteredGroupId(null);
      }
      opDeleteShapes(ydoc, selectedIds);
      useEditorStore.getState().clearSelection();
    }
    return true;
  }

  if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length === 0) return true;
    const step = e.shiftKey ? 10 : 1;
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    opNudgeShapes(ydoc, selectedIds, dx, dy);
    return true;
  }

  if (key === 'escape') {
    e.preventDefault();
    const { enteredGroupId, setEnteredGroupId, setSelectedIds, setActiveTool } =
      useEditorStore.getState();
    if (enteredGroupId) {
      const groupShape = getShape(ydoc, enteredGroupId);
      const parentGroupId = groupShape?.parentId ?? null;
      const parentShape = parentGroupId ? getShape(ydoc, parentGroupId) : null;
      const nextEnteredId = parentShape?.type === 'group' ? parentGroupId : null;
      setEnteredGroupId(nextEnteredId);
      setSelectedIds([enteredGroupId]);
      return true;
    }
    useEditorStore.getState().clearSelection();
    setActiveTool('move');
    return true;
  }

  return false;
}
