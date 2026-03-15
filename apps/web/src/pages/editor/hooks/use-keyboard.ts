import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { ToolType } from '@draftila/shared';
import { undo, redo } from '@draftila/engine/history';
import { copyShapes, pasteShapes, cutShapes, duplicateShapes } from '@draftila/engine/clipboard';
import { handlePaste as handleExternalPaste } from '@draftila/engine/figma-clipboard';
import { deleteShapes, getAllShapes } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'move',
  h: 'hand',
  r: 'rectangle',
  o: 'ellipse',
  f: 'frame',
  t: 'text',
  p: 'pen',
  l: 'line',
  y: 'polygon',
  s: 'star',
  a: 'arrow',
};

interface UseKeyboardOptions {
  ydoc: Y.Doc;
}

export function useKeyboard({ ydoc }: UseKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;

      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (!isMod && TOOL_SHORTCUTS[key]) {
        e.preventDefault();
        useEditorStore.getState().setActiveTool(TOOL_SHORTCUTS[key]!);
        return;
      }

      if (isMod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (isMod && key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      if (isMod && key === 'c') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) copyShapes(ydoc, selectedIds);
        return;
      }

      if (isMod && key === 'v') {
        e.preventDefault();
        navigator.clipboard
          .read()
          .then(async (items) => {
            let html: string | null = null;
            let text: string | null = null;

            for (const item of items) {
              if (item.types.includes('text/html')) {
                html = await (await item.getType('text/html')).text();
              }
              if (item.types.includes('text/plain')) {
                text = await (await item.getType('text/plain')).text();
              }
            }

            if (html || text) {
              const newIds = handleExternalPaste(ydoc, html, text);
              if (newIds.length > 0) {
                useEditorStore.getState().setSelectedIds(newIds);
                return;
              }
            }

            const fallbackIds = pasteShapes(ydoc);
            if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
          })
          .catch(() => {
            const fallbackIds = pasteShapes(ydoc);
            if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
          });
        return;
      }

      if (isMod && key === 'x') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          cutShapes(ydoc, selectedIds);
          useEditorStore.getState().clearSelection();
        }
        return;
      }

      if (isMod && key === 'd') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          const newIds = duplicateShapes(ydoc, selectedIds);
          useEditorStore.getState().setSelectedIds(newIds);
        }
        return;
      }

      if (isMod && key === 'a') {
        e.preventDefault();
        const allShapes = getAllShapes(ydoc);
        useEditorStore.getState().setSelectedIds(allShapes.map((s) => s.id));
        return;
      }

      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          deleteShapes(ydoc, selectedIds);
          useEditorStore.getState().clearSelection();
        }
        return;
      }

      if (key === 'escape') {
        e.preventDefault();
        useEditorStore.getState().clearSelection();
        useEditorStore.getState().setActiveTool('move');
        return;
      }

      if (isMod && (key === '=' || key === '+')) {
        e.preventDefault();
        const { camera, setCamera } = useEditorStore.getState();
        setCamera({ ...camera, zoom: Math.min(64, camera.zoom * 1.25) });
        return;
      }

      if (isMod && key === '-') {
        e.preventDefault();
        const { camera, setCamera } = useEditorStore.getState();
        setCamera({ ...camera, zoom: Math.max(0.02, camera.zoom / 1.25) });
        return;
      }

      if (isMod && key === '0') {
        e.preventDefault();
        const { camera, setCamera } = useEditorStore.getState();
        setCamera({ ...camera, zoom: 1 });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ydoc]);
}
