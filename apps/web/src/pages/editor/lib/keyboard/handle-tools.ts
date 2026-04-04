import type * as Y from 'yjs';
import type { ToolType } from '@draftila/shared';
import { getNodeTool, getPenTool } from '@draftila/engine/tools/tool-manager';
import { useEditorStore } from '@/stores/editor-store';

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'move',
  h: 'hand',
  c: 'comment',
  r: 'rectangle',
  o: 'ellipse',
  f: 'frame',
  t: 'text',
  l: 'line',
  y: 'polygon',
  s: 'star',
  a: 'arrow',
  n: 'node',
  b: 'brush',
};

export function handleToolKeyDown(e: KeyboardEvent, ydoc: Y.Doc): boolean {
  const isMod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const { activeTool } = useEditorStore.getState();

  if (activeTool === 'node' && (key === 'delete' || key === 'backspace' || key === 'escape')) {
    e.preventDefault();
    getNodeTool().onKeyDown(key === 'escape' ? 'Escape' : 'Delete', {
      ydoc,
      camera: useEditorStore.getState().camera,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
    });
    return true;
  }

  if (activeTool === 'pen' && (key === 'delete' || key === 'backspace' || key === 'escape')) {
    e.preventDefault();
    getPenTool().onKeyDown(key === 'escape' ? 'Escape' : 'Delete', {
      ydoc,
      camera: useEditorStore.getState().camera,
      canvasPoint: useEditorStore.getState().cursorCanvasPoint ?? { x: 0, y: 0 },
      screenPoint: { x: 0, y: 0 },
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      button: 0,
    });
    return true;
  }

  if (activeTool === 'pen' && !isMod && key === 'enter') {
    e.preventDefault();
    getPenTool().onKeyDown('Enter', {
      ydoc,
      camera: useEditorStore.getState().camera,
      canvasPoint: useEditorStore.getState().cursorCanvasPoint ?? { x: 0, y: 0 },
      screenPoint: { x: 0, y: 0 },
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      button: 0,
    });
    return true;
  }

  if (!isMod && key === 'enter') {
    e.preventDefault();
    const state = useEditorStore.getState();
    if (state.activeTool === 'node') {
      state.setActiveTool('move');
      return true;
    }

    if (state.selectedIds.length !== 1) return true;
    const selectedId = state.selectedIds[0];
    if (!selectedId) return true;
    if (!getNodeTool().canEditShape(ydoc, selectedId)) return true;

    state.setActiveTool('node');
    getNodeTool().enterPathEditingForShape(ydoc, selectedId);
    return true;
  }

  if (!isMod && e.shiftKey && key === 'd') {
    e.preventDefault();
    const store = useEditorStore.getState();
    const nextView = store.rightPanelView === 'inspect' ? 'properties' : 'inspect';
    store.setRightPanelView(nextView);
    store.setRightPanelOpen(true);
    return true;
  }

  if (!isMod && key === 'p') {
    e.preventDefault();
    useEditorStore.getState().setActiveTool(e.shiftKey ? 'pencil' : 'pen');
    return true;
  }

  if (e.shiftKey) {
    return false;
  }

  if (!isMod && TOOL_SHORTCUTS[key]) {
    const tool = TOOL_SHORTCUTS[key]!;
    e.preventDefault();
    useEditorStore.getState().setActiveTool(tool);
    return true;
  }

  return false;
}
