import type { FrameShape, Shape } from '@draftila/shared';
import type { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import {
  renderSelectionForShape,
  renderHoverForShape,
  getCornerRadii,
} from '@draftila/engine/shape-renderer';
import { getSelectionBounds } from '@draftila/engine/selection';
import type { TransformContext } from './canvas-shape-transforms';
import { applyTransforms } from './canvas-shape-transforms';

export function renderHover(
  renderer: Canvas2DRenderer,
  hoveredId: string | null,
  selectedSet: ReadonlySet<string>,
  shapeMap: ReadonlyMap<string, Shape>,
  isShapeVisible: (shape: Shape) => boolean,
  zoom: number,
) {
  if (hoveredId && !selectedSet.has(hoveredId)) {
    const hoveredShape = shapeMap.get(hoveredId);
    if (hoveredShape && isShapeVisible(hoveredShape)) {
      renderHoverForShape(renderer, hoveredShape, zoom);
    }
  }
}

export function renderSelection(
  renderer: Canvas2DRenderer,
  shapes: readonly Shape[],
  selectedSet: ReadonlySet<string>,
  tc: TransformContext,
  isShapeVisible: (shape: Shape) => boolean,
  zoom: number,
): Shape[] {
  const selectedShapes: Shape[] = [];
  for (const shape of shapes) {
    if (!isShapeVisible(shape)) continue;
    if (selectedSet.has(shape.id)) {
      const displayShape = applyTransforms(shape, tc);
      renderSelectionForShape(renderer, displayShape, zoom);
      selectedShapes.push(displayShape);
    }
  }
  return selectedShapes;
}

export function renderFrameLabels(
  renderer: Canvas2DRenderer,
  shapes: readonly Shape[],
  shapeMap: ReadonlyMap<string, Shape>,
  selectedSet: ReadonlySet<string>,
  tc: TransformContext,
  isShapeVisible: (shape: Shape) => boolean,
  zoom: number,
) {
  for (const shape of shapes) {
    if (shape.type !== 'frame') continue;
    if (!isShapeVisible(shape)) continue;

    const parentShape = shape.parentId ? shapeMap.get(shape.parentId) : null;
    const isTopLevel = !parentShape || parentShape.type !== 'frame';
    const isSelected = selectedSet.has(shape.id);

    if (!isTopLevel && !isSelected) continue;

    const displayShape = applyTransforms(shape, tc);
    renderer.drawFrameLabel(displayShape.x, displayShape.y, displayShape.name, zoom, isSelected);
  }
}

export function renderHandlesAndSizeLabel(
  renderer: Canvas2DRenderer,
  selectedShapes: readonly Shape[],
  activeTool: string,
  editingTextId: string | null,
  zoom: number,
) {
  if (selectedShapes.length > 0 && activeTool === 'move' && !editingTextId) {
    const bounds = getSelectionBounds([...selectedShapes]);
    if (bounds) {
      for (const handle of bounds.handles) {
        // Skip middle handles - only show corner handles
        if (
          handle.position === 'top-center' ||
          handle.position === 'bottom-center' ||
          handle.position === 'middle-left' ||
          handle.position === 'middle-right'
        ) {
          continue;
        }

        if (handle.position === 'rotation') {
          renderer.drawRotationHandle(handle.x, handle.y, zoom);
        } else if (handle.position === 'line-start' || handle.position === 'line-end') {
          renderer.drawRotationHandle(handle.x, handle.y, zoom);
        } else {
          renderer.drawHandle(handle.x, handle.y, zoom);
        }
      }
      renderer.drawSizeLabel(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        bounds.rotation,
        zoom,
      );
    }
  }
}

export function renderAiShimmerOverlays(
  renderer: Canvas2DRenderer,
  aiActiveFrameIds: ReadonlySet<string>,
  shapeMap: ReadonlyMap<string, Shape>,
  isShapeVisible: (shape: Shape) => boolean,
) {
  if (aiActiveFrameIds.size === 0) return;

  const now = performance.now();
  const shimmerPeriod = 1800;
  const phase = (now % shimmerPeriod) / shimmerPeriod;

  for (const frameId of aiActiveFrameIds) {
    const shape = shapeMap.get(frameId);
    if (!shape || !isShapeVisible(shape)) continue;

    const cornerRadius = shape.type === 'frame' ? getCornerRadii(shape as FrameShape) : 0;

    let isLightBackground = true;
    if ('fills' in shape && Array.isArray(shape.fills)) {
      const visibleFill = shape.fills.find((f) => f.visible);
      if (visibleFill) {
        const hex = visibleFill.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        isLightBackground = luminance > 0.5;
      }
    }

    renderer.drawShimmerOverlay(
      shape.x,
      shape.y,
      shape.width,
      shape.height,
      shape.rotation,
      cornerRadius,
      phase,
      isLightBackground,
    );
  }
}
