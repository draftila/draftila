import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import type { FrameShape, Shape } from '@draftila/shared';
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { getAllShapes, observeShapes } from '@draftila/engine/scene-graph';
import {
  getPageBackgroundColor,
  observePages,
  DEFAULT_PAGE_BACKGROUND,
  observeGuides,
  setActivePageForGuides,
} from '@draftila/engine';
import {
  renderShape,
  renderSelectionForShape,
  renderHoverForShape,
  computeArrowheadGeometry,
} from '@draftila/engine/shape-renderer';
import { simpleStyle } from '@draftila/engine/renderer';
import {
  getMoveTool,
  getRectangleTool,
  getEllipseTool,
  getFrameTool,
  getPenTool,
  getPencilTool,
  getNodeTool,
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
import {
  ensureFontsLoaded,
  onFontsLoaded,
  collectFontFamilies,
} from '@draftila/engine/font-manager';
import getStroke from 'perfect-freehand';

export function useCanvas({ ydoc }: { ydoc: Y.Doc }) {
  const activePageId = useEditorStore((s) => s.activePageId);
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

  const needsRedrawRef = useRef(false);
  const pageBgRef = useRef(DEFAULT_PAGE_BACKGROUND);

  useEffect(() => {
    pageBgRef.current = activePageId
      ? getPageBackgroundColor(ydoc, activePageId)
      : DEFAULT_PAGE_BACKGROUND;

    return observePages(ydoc, () => {
      const currentPageId = useEditorStore.getState().activePageId;
      pageBgRef.current = currentPageId
        ? getPageBackgroundColor(ydoc, currentPageId)
        : DEFAULT_PAGE_BACKGROUND;
    });
  }, [ydoc, activePageId]);

  useEffect(() => {
    shapeCacheRef.current = getAllShapes(ydoc);
    ensureFontsLoaded(collectFontFamilies(shapeCacheRef.current));

    const unobserve = observeShapes(ydoc, () => {
      shapeCacheRef.current = getAllShapes(ydoc);
      ensureFontsLoaded(collectFontFamilies(shapeCacheRef.current));
    });

    const unsubscribeFonts = onFontsLoaded(() => {
      needsRedrawRef.current = true;
    });

    return () => {
      unobserve();
      unsubscribeFonts();
    };
  }, [ydoc, activePageId]);

  useEffect(() => {
    if (activePageId) {
      setActivePageForGuides(ydoc, activePageId);
    }
    const unobserveGuides = observeGuides(ydoc, (guides) => {
      useEditorStore.getState().setGuides(guides);
    });
    return unobserveGuides;
  }, [ydoc, activePageId]);

  const draw = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const { camera, selectedIds, hoveredId, activeTool } = useEditorStore.getState();
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
    renderer.fillBackground(pageBgRef.current);

    renderer.save();
    renderer.applyCamera(camera);

    const moveTool = getMoveTool();
    const nodeTool = getNodeTool();
    const nodeEditingShapeId = activeTool === 'node' ? nodeTool.getEditingShapeId() : null;
    const nodePreviewPathData = activeTool === 'node' ? nodeTool.getPreviewPathData() : null;
    const dragPositions = moveTool.getDragPositions();
    const dragEndpointOffset = moveTool.getDragEndpointOffsets();
    const resizePreview = moveTool.getResizePreview();
    const rotationPreview = moveTool.getRotationPreview();
    const endpointPreview = moveTool.getEndpointPreview();

    const applyDragToShape = (s: Shape): Shape => {
      const dragPos = dragPositions?.get(s.id);
      if (!dragPos || !dragEndpointOffset) return s;
      const updated = { ...s, x: dragPos.x, y: dragPos.y } as Shape;
      if (s.type === 'line' && dragEndpointOffset) {
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

    const applyRotationToShape = (s: Shape): Shape => {
      const angle = rotationPreview?.get(s.id);
      if (angle === undefined) return s;
      return { ...s, rotation: angle } as Shape;
    };

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
        svgPathData: undefined,
      } as Shape;
    };

    const { editingTextId } = useEditorStore.getState();

    const clipStack: string[] = [];

    for (const shape of shapes) {
      while (clipStack.length > 0) {
        const clipParentId = clipStack[clipStack.length - 1]!;
        let isDescendant = false;
        let checkId: string | null = shape.parentId ?? null;
        while (checkId) {
          if (checkId === clipParentId) {
            isDescendant = true;
            break;
          }
          const parent = shapeMap.get(checkId);
          checkId = parent?.parentId ?? null;
        }
        if (!isDescendant) {
          renderer.endClip();
          clipStack.pop();
        } else {
          break;
        }
      }

      if (!isShapeVisible(shape)) continue;

      let displayShape = shape;
      if (endpointPreview?.shapeId === shape.id) {
        displayShape = applyEndpointPreviewToShape(shape);
      } else if (resizePreview?.get(shape.id)) {
        displayShape = applyResizeToShape(shape, resizePreview.get(shape.id)!);
      } else if (dragPositions?.has(shape.id)) {
        displayShape = applyDragToShape(shape);
      } else if (rotationPreview?.has(shape.id)) {
        displayShape = applyRotationToShape(shape);
      }

      if (nodeEditingShapeId && nodePreviewPathData && shape.id === nodeEditingShapeId) {
        displayShape = {
          ...displayShape,
          svgPathData: nodePreviewPathData,
        } as Shape;
      }

      renderShape(renderer, displayShape);

      if (
        displayShape.type === 'frame' &&
        (displayShape as Shape & { clip?: boolean }).clip !== false
      ) {
        const frame = displayShape as FrameShape;
        const hasIndependentCorners =
          frame.cornerRadiusTL !== undefined ||
          frame.cornerRadiusTR !== undefined ||
          frame.cornerRadiusBL !== undefined ||
          frame.cornerRadiusBR !== undefined;
        const clipRadii: number | [number, number, number, number] = hasIndependentCorners
          ? [
              frame.cornerRadiusTL ?? frame.cornerRadius,
              frame.cornerRadiusTR ?? frame.cornerRadius,
              frame.cornerRadiusBR ?? frame.cornerRadius,
              frame.cornerRadiusBL ?? frame.cornerRadius,
            ]
          : frame.cornerRadius;
        renderer.beginClip(
          displayShape.x,
          displayShape.y,
          displayShape.width,
          displayShape.height,
          displayShape.rotation,
          clipRadii,
        );
        clipStack.push(displayShape.id);
      }
    }

    while (clipStack.length > 0) {
      renderer.endClip();
      clipStack.pop();
    }

    const { aiActiveFrameIds } = useEditorStore.getState();
    if (aiActiveFrameIds.size > 0) {
      const now = performance.now();
      const shimmerPeriod = 1800;
      const phase = (now % shimmerPeriod) / shimmerPeriod;

      for (const frameId of aiActiveFrameIds) {
        const shape = shapeMap.get(frameId);
        if (!shape || !isShapeVisible(shape)) continue;

        let cornerRadius: number | [number, number, number, number] = 0;
        if (shape.type === 'frame') {
          const frame = shape as FrameShape;
          const hasIndependentCorners =
            frame.cornerRadiusTL !== undefined ||
            frame.cornerRadiusTR !== undefined ||
            frame.cornerRadiusBL !== undefined ||
            frame.cornerRadiusBR !== undefined;
          cornerRadius = hasIndependentCorners
            ? [
                frame.cornerRadiusTL ?? frame.cornerRadius,
                frame.cornerRadiusTR ?? frame.cornerRadius,
                frame.cornerRadiusBR ?? frame.cornerRadius,
                frame.cornerRadiusBL ?? frame.cornerRadius,
              ]
            : frame.cornerRadius;
        }

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

    if (camera.zoom >= 8) {
      const viewport = renderer.getViewport(camera);
      renderer.drawPixelGrid(viewport, camera.zoom);
    }

    const { guides, selectedGuideId, draggingGuide, guidesVisible } = useEditorStore.getState();
    const guideViewport = renderer.getViewport(camera);

    if (guidesVisible) {
      for (const guide of guides) {
        renderer.drawGuide(
          guide.axis,
          guide.position,
          guideViewport,
          camera.zoom,
          guide.id === selectedGuideId,
        );
      }

      if (selectedGuideId) {
        const selectedGuide = guides.find((g) => g.id === selectedGuideId);
        if (selectedGuide) {
          renderer.drawGuidePositionLabel(selectedGuide.axis, selectedGuide.position, camera.zoom);
        }
      }
    }

    if (draggingGuide) {
      renderer.drawGuide(
        draggingGuide.axis,
        draggingGuide.position,
        guideViewport,
        camera.zoom,
        false,
      );
    }

    const selectedSet = new Set(selectedIds);

    if (hoveredId && !selectedSet.has(hoveredId)) {
      const hoveredShape = shapeMap.get(hoveredId);
      if (hoveredShape && isShapeVisible(hoveredShape)) {
        renderHoverForShape(renderer, hoveredShape, camera.zoom);
      }
    }

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
        } else if (rotationPreview?.has(shape.id)) {
          displayShape = applyRotationToShape(shape);
        }
        renderSelectionForShape(renderer, displayShape, camera.zoom);
        selectedShapes.push(displayShape);
      }
    }

    for (const shape of shapes) {
      if (shape.type !== 'frame') continue;
      if (!isShapeVisible(shape)) continue;

      const parentShape = shape.parentId ? shapeMap.get(shape.parentId) : null;
      const isTopLevel = !parentShape || parentShape.type !== 'frame';
      const isSelected = selectedSet.has(shape.id);

      if (!isTopLevel && !isSelected) continue;

      let displayShape: Shape = shape;
      const resized = resizePreview?.get(shape.id);
      if (endpointPreview?.shapeId === shape.id) {
        displayShape = applyEndpointPreviewToShape(shape);
      } else if (resized) {
        displayShape = applyResizeToShape(shape, resized);
      } else if (dragPositions?.has(shape.id)) {
        displayShape = applyDragToShape(shape);
      } else if (rotationPreview?.has(shape.id)) {
        displayShape = applyRotationToShape(shape);
      }
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

    if (activeTool === 'node') {
      const editingShapeId = nodeTool.getEditingShapeId();
      const editingShape = editingShapeId ? shapeMap.get(editingShapeId) : null;
      if (editingShape) {
        const subpaths = nodeTool.getSubpaths();
        const midpointHandles = nodeTool.getMidpointHandles();
        const selectedNodes = nodeTool.selectedNodes;
        const selectedNodeSet = new Set(
          selectedNodes.map((n) => `${n.subpathIndex}:${n.nodeIndex}`),
        );

        for (const midpoint of midpointHandles) {
          renderer.drawBezierHandle(
            editingShape.x + midpoint.x,
            editingShape.y + midpoint.y,
            camera.zoom,
          );
        }

        for (let subpathIndex = 0; subpathIndex < subpaths.length; subpathIndex++) {
          const subpath = subpaths[subpathIndex];
          if (!subpath) continue;
          for (let nodeIndex = 0; nodeIndex < subpath.nodes.length; nodeIndex++) {
            const node = subpath.nodes[nodeIndex];
            if (!node) continue;

            const anchorX = editingShape.x + node.x;
            const anchorY = editingShape.y + node.y;

            const handleInX = anchorX + node.handleInX;
            const handleInY = anchorY + node.handleInY;
            if (node.handleInX !== 0 || node.handleInY !== 0) {
              renderer.drawControlLine(anchorX, anchorY, handleInX, handleInY, camera.zoom);
              renderer.drawBezierHandle(handleInX, handleInY, camera.zoom);
            }

            const handleOutX = anchorX + node.handleOutX;
            const handleOutY = anchorY + node.handleOutY;
            if (node.handleOutX !== 0 || node.handleOutY !== 0) {
              renderer.drawControlLine(anchorX, anchorY, handleOutX, handleOutY, camera.zoom);
              renderer.drawBezierHandle(handleOutX, handleOutY, camera.zoom);
            }

            const isSelected = selectedNodeSet.has(`${subpathIndex}:${nodeIndex}`);
            renderer.drawPathNode(anchorX, anchorY, camera.zoom, isSelected);
          }
        }
      }
    }

    if (moveTool.marqueeRect) {
      const { x, y, width, height } = moveTool.marqueeRect;
      renderer.drawMarquee(x, y, width, height, camera.zoom);
    }

    for (const line of moveTool.getSnapLines()) {
      renderer.drawSnapLine(line.axis, line.position, line.start, line.end, camera.zoom);
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

    const drawingTools = [
      getRectangleTool(),
      getEllipseTool(),
      getFrameTool(),
      getPolygonTool(),
      getStarTool(),
      getLineTool(),
      getArrowTool(),
      getTextTool(),
    ] as const;

    for (const tool of drawingTools) {
      for (const line of tool.getSnapLines()) {
        renderer.drawSnapLine(line.axis, line.position, line.start, line.end, camera.zoom);
      }
      for (const indicator of tool.getDistanceIndicators()) {
        renderer.drawDistanceIndicator(
          indicator.axis,
          indicator.from,
          indicator.to,
          indicator.position,
          camera.zoom,
        );
      }
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
      const headGeom = computeArrowheadGeometry(
        arrowPreview.x2,
        arrowPreview.y2,
        arrowPreview.x1,
        arrowPreview.y1,
        2,
        'line_arrow',
      );
      if (headGeom) {
        renderer.drawPath(headGeom.points, arrowPreviewRenderStyle, false);
      }
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
    const pencilTool = getPencilTool();
    if (activeTool === 'pencil') {
      const freehandPoints = pencilTool.currentPoints;
      if (freehandPoints.length >= 2) {
        const inputPoints = freehandPoints.map(
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
    }

    if (activeTool === 'pen') {
      const freehandPoints = penTool.getFreehandPoints();
      if (freehandPoints.length >= 2) {
        const inputPoints = freehandPoints.map(
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

      const previewPath = penTool.getPreviewPathData();
      if (previewPath) {
        renderer.drawSvgPath(
          { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          previewPath,
          simpleStyle({ stroke: '#0D99FF', strokeWidth: 1 / camera.zoom, opacity: 0.9 }),
          'nonzero',
        );
      }

      for (const node of penTool.getPlacedNodes()) {
        renderer.drawPathNode(node.x, node.y, camera.zoom, false);
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
    case 'pencil':
    case 'node':
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
