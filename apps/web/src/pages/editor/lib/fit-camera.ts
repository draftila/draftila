import type * as Y from 'yjs';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { MIN_ZOOM } from '@draftila/engine/camera';
import { useEditorStore } from '@/stores/editor-store';

const FIT_MAX_ZOOM = 64;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getBounds(
  shapes: Array<{ x: number; y: number; width: number; height: number }>,
): Bounds | null {
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
}

export function getCanvasViewportRect(): DOMRect | null {
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  return canvas.getBoundingClientRect();
}

export function fitCameraToBounds(bounds: Bounds, viewport: DOMRect, padding: number) {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = Math.min(
    FIT_MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)),
  );

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: viewport.width / 2 - centerX * zoom,
    y: viewport.height / 2 - centerY * zoom,
    zoom,
  };
}

export function fitCameraToAllShapes(ydoc: Y.Doc, padding = 80) {
  const shapes = getAllShapes(ydoc).filter((shape) => shape.visible);
  const bounds = getBounds(shapes);
  if (!bounds) return;
  const viewport = getCanvasViewportRect();
  if (!viewport) return;
  const next = fitCameraToBounds(bounds, viewport, padding);
  if (!next) return;
  useEditorStore.getState().setCamera(next);
}
