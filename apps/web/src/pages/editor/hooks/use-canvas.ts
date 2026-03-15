import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { getAllShapes, observeShapes } from '@draftila/engine/scene-graph';
import {
  renderShape,
  renderSelectionForShape,
  computeArrowHead,
} from '@draftila/engine/shape-renderer';
import { simpleStyle } from '@draftila/engine/renderer';
import {
  getMoveTool,
  getRectangleTool,
  getEllipseTool,
  getFrameTool,
  getPenTool,
  getLineTool,
  getArrowTool,
  getPolygonTool,
  getStarTool,
  getTextTool,
} from '@draftila/engine/tools/tool-manager';
import { generatePolygonPoints, generateStarPoints } from '@draftila/engine/shape-renderer';
import { getSelectionBounds } from '@draftila/engine/selection';
import type { ResizePreviewEntry } from '@draftila/engine/tools/move-tool';
import { useEditorStore } from '@/stores/editor-store';
import getStroke from 'perfect-freehand';

export function useCanvas({ ydoc }: { ydoc: Y.Doc }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Canvas2DRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const shapeCacheRef = useRef<Shape[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new Canvas2DRenderer(canvas);
    rendererRef.current = renderer;

    const updateSize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      renderer.resize(rect.width, rect.height, dpr);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    shapeCacheRef.current = getAllShapes(ydoc);

    const unobserve = observeShapes(ydoc, () => {
      shapeCacheRef.current = getAllShapes(ydoc);
    });

    return unobserve;
  }, [ydoc]);

  const draw = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const { camera, selectedIds, activeTool } = useEditorStore.getState();
    const shapes = shapeCacheRef.current;
    const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

    const isShapeVisible = (shape: Shape): boolean => {
      if (!shape.visible) return false;
      let currentParentId = shape.parentId ?? null;
      while (currentParentId) {
        const parent = shapeMap.get(currentParentId);
        if (!parent) return false;
        if (!parent.visible) return false;
        currentParentId = parent.parentId ?? null;
      }
      return true;
    };

    renderer.clear();
    renderer.save();
    renderer.applyCamera(camera);

    const moveTool = getMoveTool();
    const dragPositions = moveTool.getDragPositions();
    const dragEndpointOffset = moveTool.getDragEndpointOffsets();
    const resizePreview = moveTool.getResizePreview();
    const endpointPreview = moveTool.getEndpointPreview();

    const applyDragToShape = (s: Shape): Shape => {
      const dragPos = dragPositions?.get(s.id);
      if (!dragPos || !dragEndpointOffset) return s;
      const updated = { ...s, x: dragPos.x, y: dragPos.y } as Shape;
      if ((s.type === 'line' || s.type === 'arrow') && dragEndpointOffset) {
        const orig = s as Shape & { x1: number; y1: number; x2: number; y2: number };
        return {
          ...updated,
          x1: orig.x1 + dragEndpointOffset.dx,
          y1: orig.y1 + dragEndpointOffset.dy,
          x2: orig.x2 + dragEndpointOffset.dx,
          y2: orig.y2 + dragEndpointOffset.dy,
        } as Shape;
      }
      if (s.type === 'path' && dragEndpointOffset) {
        const orig = s as Shape & { points: Array<{ x: number; y: number; pressure: number }> };
        return {
          ...updated,
          points: orig.points.map((p) => ({
            x: p.x + dragEndpointOffset.dx,
            y: p.y + dragEndpointOffset.dy,
            pressure: p.pressure,
          })),
        } as Shape;
      }
      return updated;
    };

    const applyResizeToShape = (s: Shape, entry: ResizePreviewEntry): Shape =>
      ({ ...s, ...entry }) as unknown as Shape;

    const applyEndpointPreviewToShape = (s: Shape): Shape => {
      if (!endpointPreview || endpointPreview.shapeId !== s.id) return s;
      const ep = endpointPreview;
      return {
        ...s,
        x: Math.min(ep.x1, ep.x2),
        y: Math.min(ep.y1, ep.y2),
        width: Math.max(1, Math.abs(ep.x2 - ep.x1)),
        height: Math.max(1, Math.abs(ep.y2 - ep.y1)),
        x1: ep.x1,
        y1: ep.y1,
        x2: ep.x2,
        y2: ep.y2,
      } as Shape;
    };

    const { editingTextId } = useEditorStore.getState();

    for (const shape of shapes) {
      if (!isShapeVisible(shape)) continue;
      const resized = resizePreview?.get(shape.id);
      if (endpointPreview?.shapeId === shape.id) {
        renderShape(renderer, applyEndpointPreviewToShape(shape));
      } else if (resized) {
        renderShape(renderer, applyResizeToShape(shape, resized));
      } else if (dragPositions?.has(shape.id)) {
        renderShape(renderer, applyDragToShape(shape));
      } else {
        renderShape(renderer, shape);
      }
    }

    const selectedSet = new Set(selectedIds);
    const selectedShapes: Shape[] = [];
    for (const shape of shapes) {
      if (!isShapeVisible(shape)) continue;
      if (selectedSet.has(shape.id)) {
        const resized = resizePreview?.get(shape.id);
        let displayShape = shape;
        if (endpointPreview?.shapeId === shape.id) {
          displayShape = applyEndpointPreviewToShape(shape);
        } else if (resized) {
          displayShape = applyResizeToShape(shape, resized);
        } else if (dragPositions?.has(shape.id)) {
          displayShape = applyDragToShape(shape);
        }
        renderSelectionForShape(renderer, displayShape);
        selectedShapes.push(displayShape);
      }
    }

    for (const shape of shapes) {
      if (shape.type !== 'frame') continue;
      if (!isShapeVisible(shape)) continue;
      let displayShape: Shape = shape;
      const resized = resizePreview?.get(shape.id);
      if (endpointPreview?.shapeId === shape.id) {
        displayShape = applyEndpointPreviewToShape(shape);
      } else if (resized) {
        displayShape = applyResizeToShape(shape, resized);
      } else if (dragPositions?.has(shape.id)) {
        displayShape = applyDragToShape(shape);
      }
      const isSelected = selectedSet.has(shape.id);
      renderer.drawFrameLabel(
        displayShape.x,
        displayShape.y,
        displayShape.name,
        camera.zoom,
        isSelected,
      );
    }

    if (selectedShapes.length > 0 && activeTool === 'move' && !editingTextId) {
      const bounds = getSelectionBounds(selectedShapes);
      if (bounds) {
        for (const handle of bounds.handles) {
          if (handle.position === 'rotation') {
            renderer.drawRotationHandle(handle.x, handle.y, camera.zoom);
          } else if (handle.position === 'line-start' || handle.position === 'line-end') {
            renderer.drawRotationHandle(handle.x, handle.y, camera.zoom);
          } else {
            renderer.drawHandle(handle.x, handle.y, camera.zoom);
          }
        }
        renderer.drawSizeLabel(
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          bounds.rotation,
          camera.zoom,
        );
      }
    }

    if (moveTool.marqueeRect) {
      const { x, y, width, height } = moveTool.marqueeRect;
      renderer.drawMarquee(x, y, width, height);
    }

    for (const line of moveTool.getSnapLines()) {
      renderer.drawSnapLine(line.axis, line.position, line.start, line.end);
    }

    for (const indicator of moveTool.getDistanceIndicators()) {
      renderer.drawDistanceIndicator(
        indicator.axis,
        indicator.from,
        indicator.to,
        indicator.position,
        camera.zoom,
      );
    }

    const previewStroke = 1 / camera.zoom;

    const rectPreview = getRectangleTool().previewRect;
    if (activeTool === 'rectangle' && rectPreview) {
      renderer.drawRect(
        { ...rectPreview, rotation: 0 },
        simpleStyle({
          fill: '#D9D9D9',
          stroke: '#0D99FF',
          strokeWidth: previewStroke,
          opacity: 0.7,
        }),
        0,
      );
    }

    const ellipsePreview = getEllipseTool().previewRect;
    if (activeTool === 'ellipse' && ellipsePreview) {
      renderer.drawEllipse(
        { ...ellipsePreview, rotation: 0 },
        simpleStyle({
          fill: '#D9D9D9',
          stroke: '#0D99FF',
          strokeWidth: previewStroke,
          opacity: 0.7,
        }),
      );
    }

    const framePreview = getFrameTool().previewRect;
    if (activeTool === 'frame' && framePreview) {
      renderer.drawRect(
        { ...framePreview, rotation: 0 },
        simpleStyle({
          fill: '#FFFFFF',
          stroke: '#0D99FF',
          strokeWidth: previewStroke,
          opacity: 0.7,
        }),
        0,
      );
    }

    const linePreview = getLineTool().previewLine;
    if (activeTool === 'line' && linePreview) {
      renderer.drawPath(
        [
          [linePreview.x1, linePreview.y1],
          [linePreview.x2, linePreview.y2],
        ],
        simpleStyle({ stroke: '#000000', strokeWidth: 2, opacity: 0.7 }),
        false,
      );
    }

    const arrowPreview = getArrowTool().previewLine;
    if (activeTool === 'arrow' && arrowPreview) {
      const arrowPreviewRenderStyle = simpleStyle({
        stroke: '#000000',
        strokeWidth: 2,
        opacity: 0.7,
      });
      renderer.drawPath(
        [
          [arrowPreview.x1, arrowPreview.y1],
          [arrowPreview.x2, arrowPreview.y2],
        ],
        arrowPreviewRenderStyle,
        false,
      );
      const head = computeArrowHead(
        arrowPreview.x2,
        arrowPreview.y2,
        arrowPreview.x1,
        arrowPreview.y1,
        2,
      );
      renderer.drawPath([head.left, head.tip, head.right], arrowPreviewRenderStyle, false);
    }

    const polygonPreview = getPolygonTool().previewRect;
    if (activeTool === 'polygon' && polygonPreview) {
      const cx = polygonPreview.x + polygonPreview.width / 2;
      const cy = polygonPreview.y + polygonPreview.height / 2;
      const pts = generatePolygonPoints(
        cx,
        cy,
        polygonPreview.width / 2,
        polygonPreview.height / 2,
        6,
      );
      renderer.drawPath(
        pts,
        simpleStyle({
          fill: '#D9D9D9',
          stroke: '#0D99FF',
          strokeWidth: previewStroke,
          opacity: 0.7,
        }),
      );
    }

    const starPreview = getStarTool().previewRect;
    if (activeTool === 'star' && starPreview) {
      const cx = starPreview.x + starPreview.width / 2;
      const cy = starPreview.y + starPreview.height / 2;
      const pts = generateStarPoints(
        cx,
        cy,
        starPreview.width / 2,
        starPreview.height / 2,
        5,
        0.38,
      );
      renderer.drawPath(
        pts,
        simpleStyle({
          fill: '#D9D9D9',
          stroke: '#0D99FF',
          strokeWidth: previewStroke,
          opacity: 0.7,
        }),
      );
    }

    const textPreview = getTextTool().previewRect;
    if (activeTool === 'text' && textPreview) {
      renderer.drawRect(
        { ...textPreview, rotation: 0 },
        simpleStyle({ stroke: '#0D99FF', strokeWidth: previewStroke, opacity: 0.5 }),
        0,
      );
    }

    const penTool = getPenTool();
    if (activeTool === 'pen' && penTool.currentPoints.length >= 2) {
      const inputPoints = penTool.currentPoints.map(
        (p) => [p.x, p.y, p.pressure] as [number, number, number],
      );
      const strokePoints = getStroke(inputPoints, {
        size: 4,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true,
      });
      if (strokePoints.length > 0) {
        const outlinePoints = strokePoints.map((p) => [p[0]!, p[1]!] as [number, number]);
        renderer.drawPath(outlinePoints, simpleStyle({ fill: '#000000', opacity: 0.7 }));
      }
    }

    renderer.restore();
  }, []);

  useEffect(() => {
    const renderLoop = () => {
      draw();
      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return { canvasRef };
}

export function getCursorForTool(tool: string, isPanning: boolean): string {
  if (isPanning) return 'grabbing';
  switch (tool) {
    case 'move':
      return 'default';
    case 'hand':
      return 'grab';
    case 'rectangle':
    case 'ellipse':
    case 'frame':
    case 'pen':
    case 'line':
    case 'polygon':
    case 'star':
    case 'arrow':
      return 'crosshair';
    case 'text':
      return 'text';
    default:
      return 'default';
  }
}
