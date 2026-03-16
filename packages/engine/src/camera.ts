import type { Camera, Point, Viewport } from '@draftila/shared';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export function screenToCanvas(screenX: number, screenY: number, camera: Camera): Point {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  };
}

export function canvasToScreen(canvasX: number, canvasY: number, camera: Camera): Point {
  return {
    x: canvasX * camera.zoom + camera.x,
    y: canvasY * camera.zoom + camera.y,
  };
}

export function getViewportBounds(
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
): Viewport {
  return {
    minX: -camera.x / camera.zoom,
    minY: -camera.y / camera.zoom,
    maxX: (screenWidth - camera.x) / camera.zoom,
    maxY: (screenHeight - camera.y) / camera.zoom,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomAtPoint(
  camera: Camera,
  screenX: number,
  screenY: number,
  newZoom: number,
): Camera {
  const clamped = clampZoom(newZoom);
  const worldBefore = screenToCanvas(screenX, screenY, camera);
  const worldAfter = screenToCanvas(screenX, screenY, { ...camera, zoom: clamped });

  return {
    x: camera.x + (worldAfter.x - worldBefore.x) * clamped,
    y: camera.y + (worldAfter.y - worldBefore.y) * clamped,
    zoom: clamped,
  };
}

export function panCamera(camera: Camera, deltaX: number, deltaY: number): Camera {
  return {
    x: camera.x + deltaX,
    y: camera.y + deltaY,
    zoom: camera.zoom,
  };
}

export function zoomToFit(
  bounds: Viewport,
  screenWidth: number,
  screenHeight: number,
  padding = 64,
): Camera {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;

  if (contentWidth <= 0 || contentHeight <= 0) return DEFAULT_CAMERA;

  const availableWidth = screenWidth - padding * 2;
  const availableHeight = screenHeight - padding * 2;

  const zoom = clampZoom(Math.min(availableWidth / contentWidth, availableHeight / contentHeight));

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: screenWidth / 2 - centerX * zoom,
    y: screenHeight / 2 - centerY * zoom,
    zoom,
  };
}

export function getZoomPercentage(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
