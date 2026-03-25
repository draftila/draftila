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
import { renderShape, getCornerRadii } from '@draftila/engine/shape-renderer';
import { getMoveTool, getNodeTool } from '@draftila/engine/tools/tool-manager';
import { useEditorStore } from '@/stores/editor-store';
import {
  ensureFontsLoaded,
  onFontsLoaded,
  collectFontFamilies,
} from '@draftila/engine/font-manager';
import { type TransformContext, applyTransforms } from './canvas-shape-transforms';
import {
  renderHover,
  renderSelection,
  renderFrameLabels,
  renderHandlesAndSizeLabel,
  renderAiShimmerOverlays,
} from './canvas-draw-selection';
import { renderToolPreviews } from './canvas-draw-tools';
import { renderGuides, renderSnapLinesAndDistanceIndicators } from './canvas-draw-guides';
import { renderNodeEditing } from './canvas-draw-nodes';
import { updateLayoutAnimation } from './layout-animation';

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

    const tc: TransformContext = {
      dragPositions: moveTool.getDragPositions(),
      dragEndpointOffset: moveTool.getDragEndpointOffsets(),
      resizePreview: moveTool.getResizePreview(),
      rotationPreview: moveTool.getRotationPreview(),
      endpointPreview: moveTool.getEndpointPreview(),
    };

    const { editingTextId } = useEditorStore.getState();

    const autoLayoutPreview = moveTool.getAutoLayoutPreview();
    const shapePositions = new Map<string, { x: number; y: number }>();
    for (const s of shapes) {
      shapePositions.set(s.id, { x: s.x, y: s.y });
    }
    updateLayoutAnimation(autoLayoutPreview, shapePositions);

    const dragIds = tc.dragPositions;
    const deferredShapes: Shape[] = [];

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

      if (dragIds && dragIds.has(shape.id)) {
        deferredShapes.push(shape);
        continue;
      }

      let displayShape = applyTransforms(shape, tc);

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
        const clipRadii = getCornerRadii(frame);
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

    for (const shape of deferredShapes) {
      const displayShape = applyTransforms(shape, tc);
      renderShape(renderer, displayShape);
    }

    const { aiActiveFrameIds } = useEditorStore.getState();
    renderAiShimmerOverlays(renderer, aiActiveFrameIds, shapeMap, isShapeVisible);

    if (camera.zoom >= 8) {
      const viewport = renderer.getViewport(camera);
      renderer.drawPixelGrid(viewport, camera.zoom);
    }

    const guideState = useEditorStore.getState();
    renderGuides(renderer, camera, guideState);

    const selectedSet = new Set(selectedIds);

    renderHover(renderer, hoveredId, selectedSet, shapeMap, isShapeVisible, camera.zoom);

    const selectedShapes = renderSelection(
      renderer,
      shapes,
      selectedSet,
      tc,
      isShapeVisible,
      camera.zoom,
    );

    renderFrameLabels(renderer, shapes, shapeMap, selectedSet, tc, isShapeVisible, camera.zoom);

    renderHandlesAndSizeLabel(renderer, selectedShapes, activeTool, editingTextId, camera.zoom);

    if (activeTool === 'node') {
      renderNodeEditing(renderer, camera, nodeTool, shapeMap);
    }

    if (moveTool.marqueeRect) {
      const { x, y, width, height } = moveTool.marqueeRect;
      renderer.drawMarquee(x, y, width, height, camera.zoom);
    }

    renderSnapLinesAndDistanceIndicators(renderer, camera.zoom);

    renderToolPreviews(renderer, activeTool, camera);

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
