import type * as Y from 'yjs';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import {
  getBounds,
  getCanvasViewportRect,
  fitCameraToBounds,
  fitCameraToAllShapes,
} from '../fit-camera';

export function handleCameraKeyDown(e: KeyboardEvent, ydoc: Y.Doc): boolean {
  const isMod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const code = e.code;

  if (e.shiftKey && code === 'Digit1' && !isMod) {
    e.preventDefault();
    fitCameraToAllShapes(ydoc);
    return true;
  }

  if (e.shiftKey && code === 'Digit2' && !isMod) {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length === 0) return true;
    const selectedSet = new Set(selectedIds);
    const selectedShapes = getAllShapes(ydoc).filter(
      (shape) => selectedSet.has(shape.id) && shape.visible,
    );
    const bounds = getBounds(selectedShapes);
    if (!bounds) return true;
    const viewport = getCanvasViewportRect();
    if (!viewport) return true;
    const next = fitCameraToBounds(bounds, viewport, 120);
    if (!next) return true;
    useEditorStore.getState().setCamera(next);
    return true;
  }

  if (isMod && (key === '=' || key === '+')) {
    e.preventDefault();
    const { camera, setCamera } = useEditorStore.getState();
    setCamera({ ...camera, zoom: Math.min(256, camera.zoom * 1.25) });
    return true;
  }

  if (isMod && key === '-') {
    e.preventDefault();
    const { camera, setCamera } = useEditorStore.getState();
    setCamera({ ...camera, zoom: Math.max(0.02, camera.zoom / 1.25) });
    return true;
  }

  return false;
}
