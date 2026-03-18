import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { ToolType } from '@draftila/shared';
import { undo, redo } from '@draftila/engine/history';
import {
  copyShapes,
  pasteShapes,
  cutShapes,
  duplicateShapes,
  copyStyle,
  pasteStyle,
  hasStyleClipboardContent,
} from '@draftila/engine/clipboard';
import { handlePaste as handleExternalPaste } from '@draftila/engine/figma-clipboard';
import { addImageFromFile } from '@draftila/engine/image-manager';
import { getNodeTool, getPenTool } from '@draftila/engine/tools/tool-manager';
import {
  deleteShapes,
  flipShapes,
  frameSelection,
  getAllShapes,
  getSelectedContainer,
  getShape,
  getZOrder,
  groupShapes,
  moveShapesInStack,
  nudgeShapes,
  ungroupShapes,
  updateShape,
} from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'move',
  h: 'hand',
  r: 'rectangle',
  o: 'ellipse',
  f: 'frame',
  t: 'text',
  l: 'line',
  y: 'polygon',
  s: 'star',
  a: 'arrow',
  n: 'node',
};

interface UseKeyboardOptions {
  ydoc: Y.Doc;
}

function getExtensionFromMimeType(type: string): string {
  const subtype = type.split('/')[1];
  if (!subtype) return 'png';
  const cleanSubtype = subtype.split('+')[0];
  return cleanSubtype || 'png';
}

async function pasteImageFiles(
  ydoc: Y.Doc,
  files: File[],
  targetParentId: string | null,
  cursorCanvasPoint: { x: number; y: number } | null,
): Promise<string[]> {
  if (files.length === 0) return [];

  const baseX = cursorCanvasPoint?.x ?? 100;
  const baseY = cursorCanvasPoint?.y ?? 100;

  const ids = await Promise.all(
    files.map((file, index) =>
      addImageFromFile(ydoc, file, baseX + index * 20, baseY + index * 20, targetParentId),
    ),
  );

  return ids;
}

export function useKeyboard({ ydoc }: UseKeyboardOptions) {
  useEffect(() => {
    const getBounds = (shapes: Array<{ x: number; y: number; width: number; height: number }>) => {
      if (shapes.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const shape of shapes) {
        minX = Math.min(minX, shape.x);
        minY = Math.min(minY, shape.y);
        maxX = Math.max(maxX, shape.x + shape.width);
        maxY = Math.max(maxY, shape.y + shape.height);
      }
      return { minX, minY, maxX, maxY };
    };

    const getCanvasViewportRect = (): DOMRect | null => {
      const canvas = document.querySelector('canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      return canvas.getBoundingClientRect();
    };

    const fitCameraToBounds = (
      bounds: { minX: number; minY: number; maxX: number; maxY: number },
      viewport: DOMRect,
      padding: number,
    ) => {
      const contentWidth = bounds.maxX - bounds.minX;
      const contentHeight = bounds.maxY - bounds.minY;
      if (contentWidth <= 0 || contentHeight <= 0) return null;

      const availableWidth = Math.max(1, viewport.width - padding * 2);
      const availableHeight = Math.max(1, viewport.height - padding * 2);
      const zoom = Math.min(
        64,
        Math.max(0.02, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)),
      );

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;

      return {
        x: viewport.width / 2 - centerX * zoom,
        y: viewport.height / 2 - centerY * zoom,
        zoom,
      };
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;

      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const code = e.code;
      const { activeTool } = useEditorStore.getState();

      if (isMod && e.altKey && code === 'KeyC') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        const sourceId = selectedIds[0];
        if (sourceId) {
          copyStyle(ydoc, sourceId);
        }
        return;
      }

      if (isMod && e.altKey && code === 'KeyV') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0 && hasStyleClipboardContent()) {
          pasteStyle(ydoc, selectedIds);
        }
        return;
      }

      if (e.shiftKey && code === 'Digit1' && !isMod) {
        e.preventDefault();
        const shapes = getAllShapes(ydoc).filter((shape) => shape.visible);
        const bounds = getBounds(shapes);
        if (!bounds) return;
        const viewport = getCanvasViewportRect();
        if (!viewport) return;
        const next = fitCameraToBounds(bounds, viewport, 80);
        if (!next) return;
        useEditorStore.getState().setCamera(next);
        return;
      }

      if (e.shiftKey && code === 'Digit2' && !isMod) {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length === 0) return;
        const selectedSet = new Set(selectedIds);
        const selectedShapes = getAllShapes(ydoc).filter(
          (shape) => selectedSet.has(shape.id) && shape.visible,
        );
        const bounds = getBounds(selectedShapes);
        if (!bounds) return;
        const viewport = getCanvasViewportRect();
        if (!viewport) return;
        const next = fitCameraToBounds(bounds, viewport, 120);
        if (!next) return;
        useEditorStore.getState().setCamera(next);
        return;
      }

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
        return;
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
        return;
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
        return;
      }

      if (!isMod && key === 'enter') {
        e.preventDefault();
        const state = useEditorStore.getState();
        if (state.activeTool === 'node') {
          state.setActiveTool('move');
          return;
        }

        if (state.selectedIds.length !== 1) return;
        const selectedId = state.selectedIds[0];
        if (!selectedId) return;
        if (!getNodeTool().canEditShape(ydoc, selectedId)) return;

        state.setActiveTool('node');
        getNodeTool().enterPathEditingForShape(ydoc, selectedId);
        return;
      }

      if (!isMod && e.shiftKey && code === 'KeyH') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          flipShapes(ydoc, selectedIds, 'horizontal');
        }
        return;
      }

      if (!isMod && e.shiftKey && code === 'KeyV') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          flipShapes(ydoc, selectedIds, 'vertical');
        }
        return;
      }

      if (!isMod && TOOL_SHORTCUTS[key]) {
        if (key === 'p') {
          e.preventDefault();
          useEditorStore.getState().setActiveTool(e.shiftKey ? 'pencil' : 'pen');
          return;
        }

        e.preventDefault();
        useEditorStore.getState().setActiveTool(TOOL_SHORTCUTS[key]!);
        return;
      }

      if (!isMod && key === 'p') {
        e.preventDefault();
        useEditorStore.getState().setActiveTool(e.shiftKey ? 'pencil' : 'pen');
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

      if (isMod && e.altKey && code === 'KeyG') {
        e.preventDefault();
        const { selectedIds, setSelectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          const frameId = frameSelection(ydoc, selectedIds);
          if (frameId) {
            setSelectedIds([frameId]);
            useEditorStore.getState().setEnteredGroupId(null);
          }
        }
        return;
      }

      if (isMod && key === 'g' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { selectedIds, setSelectedIds } = useEditorStore.getState();
        const groupId = groupShapes(ydoc, selectedIds);
        if (groupId) {
          setSelectedIds([groupId]);
          useEditorStore.getState().setEnteredGroupId(null);
        }
        return;
      }

      if (isMod && key === 'g' && e.shiftKey) {
        e.preventDefault();
        const { selectedIds, setSelectedIds } = useEditorStore.getState();
        const childIds = ungroupShapes(ydoc, selectedIds);
        if (childIds.length > 0) {
          setSelectedIds(childIds);
          useEditorStore.getState().setEnteredGroupId(null);
        }
        return;
      }

      if (isMod && (code === 'BracketLeft' || code === 'BracketRight')) {
        e.preventDefault();
        const toExtreme = e.altKey || (e.ctrlKey && e.shiftKey && !e.metaKey);
        const direction =
          code === 'BracketRight'
            ? toExtreme
              ? 'front'
              : 'forward'
            : toExtreme
              ? 'back'
              : 'backward';

        const { selectedIds, setSelectedIds } = useEditorStore.getState();
        const movedIds = moveShapesInStack(ydoc, selectedIds, direction);
        if (movedIds.length > 0) {
          setSelectedIds(movedIds);
        }
        return;
      }

      if (isMod && key === 'c') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length > 0) copyShapes(ydoc, selectedIds);
        return;
      }

      if (isMod && e.shiftKey && key === 'v' && !e.altKey) {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        const fallbackIds = pasteShapes(ydoc, { selectedIds, inPlace: true });
        if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
        return;
      }

      if (isMod && key === 'v') {
        e.preventDefault();
        const { selectedIds, cursorCanvasPoint } = useEditorStore.getState();
        const targetParentId = getSelectedContainer(ydoc, selectedIds);
        navigator.clipboard
          .read()
          .then(async (items) => {
            let html: string | null = null;
            let text: string | null = null;
            const imageFiles: File[] = [];

            for (const item of items) {
              if (item.types.includes('text/html')) {
                html = await (await item.getType('text/html')).text();
              }
              if (item.types.includes('text/plain')) {
                text = await (await item.getType('text/plain')).text();
              }
              for (const type of item.types) {
                if (!type.startsWith('image/')) continue;
                const blob = await item.getType(type);
                imageFiles.push(
                  new File([blob], `pasted-image.${getExtensionFromMimeType(type)}`, {
                    type,
                  }),
                );
              }
            }

            if (imageFiles.length > 0) {
              const imageIds = await pasteImageFiles(
                ydoc,
                imageFiles,
                targetParentId,
                cursorCanvasPoint,
              );
              if (imageIds.length > 0) {
                useEditorStore.getState().setSelectedIds(imageIds);
                return;
              }
            }

            if (html || text) {
              const newIds = handleExternalPaste(ydoc, html, text, {
                targetParentId,
                cursorPosition: cursorCanvasPoint,
              });
              if (newIds.length > 0) {
                useEditorStore.getState().setSelectedIds(newIds);
                return;
              }
            }

            const fallbackIds = pasteShapes(ydoc, {
              selectedIds,
              cursorPosition: cursorCanvasPoint,
            });
            if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
          })
          .catch(() => {
            const fallbackIds = pasteShapes(ydoc, {
              selectedIds,
              cursorPosition: cursorCanvasPoint,
            });
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

      if (isMod && e.shiftKey && code === 'KeyL') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length === 0) return;

        const selectedShapes = selectedIds
          .map((id) => getShape(ydoc, id))
          .filter((shape): shape is NonNullable<typeof shape> => shape !== null);

        if (selectedShapes.length === 0) return;

        const shouldLock = selectedShapes.some((shape) => !shape.locked);
        for (const shape of selectedShapes) {
          updateShape(ydoc, shape.id, { locked: shouldLock });
        }
        return;
      }

      if (isMod && e.shiftKey && code === 'KeyH') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length === 0) return;

        const selectedShapes = selectedIds
          .map((id) => getShape(ydoc, id))
          .filter((shape): shape is NonNullable<typeof shape> => shape !== null);

        if (selectedShapes.length === 0) return;

        const shouldShow = selectedShapes.some((shape) => !shape.visible);
        for (const shape of selectedShapes) {
          updateShape(ydoc, shape.id, { visible: shouldShow });
        }
        return;
      }

      if (!isMod && code === 'Tab') {
        e.preventDefault();
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
        const delta = e.shiftKey ? -1 : 1;
        const nextIndex =
          currentIndex === -1
            ? e.shiftKey
              ? siblingIds.length - 1
              : 0
            : (currentIndex + delta + siblingIds.length) % siblingIds.length;
        const nextId = siblingIds[nextIndex];
        if (!nextId) return;

        setSelectedIds([nextId]);
        setEnteredGroupId(null);
        return;
      }

      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        const { selectedIds, enteredGroupId } = useEditorStore.getState();
        if (selectedIds.length > 0) {
          if (enteredGroupId && selectedIds.includes(enteredGroupId)) {
            useEditorStore.getState().setEnteredGroupId(null);
          }
          deleteShapes(ydoc, selectedIds);
          useEditorStore.getState().clearSelection();
        }
        return;
      }

      if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
        e.preventDefault();
        const { selectedIds } = useEditorStore.getState();
        if (selectedIds.length === 0) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        nudgeShapes(ydoc, selectedIds, dx, dy);
        return;
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
          return;
        }
        useEditorStore.getState().clearSelection();
        setActiveTool('move');
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

      if (isMod && code === 'Digit1') {
        e.preventDefault();
        const { camera, setCamera } = useEditorStore.getState();
        setCamera({ ...camera, zoom: 1 });
        return;
      }

      if (isMod && code === 'Digit2') {
        e.preventDefault();
        const { camera, setCamera } = useEditorStore.getState();
        setCamera({ ...camera, zoom: 2 });
        return;
      }

      if (isMod && code === 'Digit5') {
        e.preventDefault();
        const { camera, setCamera } = useEditorStore.getState();
        setCamera({ ...camera, zoom: 0.5 });
      }
    };

    const handlePasteEvent = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;

      e.preventDefault();

      const { selectedIds, cursorCanvasPoint } = useEditorStore.getState();
      const targetParentId = getSelectedContainer(ydoc, selectedIds);

      const imageFiles = Array.from(e.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (imageFiles.length > 0) {
        pasteImageFiles(ydoc, imageFiles, targetParentId, cursorCanvasPoint)
          .then((imageIds) => {
            if (imageIds.length > 0) {
              useEditorStore.getState().setSelectedIds(imageIds);
            }
          })
          .catch(() => undefined);
        return;
      }

      const html = e.clipboardData?.getData('text/html') || null;
      const text = e.clipboardData?.getData('text/plain') || null;

      if (html || text) {
        const newIds = handleExternalPaste(ydoc, html, text, {
          targetParentId,
          cursorPosition: cursorCanvasPoint,
        });
        if (newIds.length > 0) {
          useEditorStore.getState().setSelectedIds(newIds);
          return;
        }
      }

      const fallbackIds = pasteShapes(ydoc, {
        selectedIds,
        cursorPosition: cursorCanvasPoint,
      });
      if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePasteEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePasteEvent);
    };
  }, [ydoc]);
}
