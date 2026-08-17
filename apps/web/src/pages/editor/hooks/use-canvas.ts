import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type * as Y from 'yjs';
import type { FrameShape, Shape } from '@draftila/shared';
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { observeShapes, isUpdateOnlyChange, type ShapeChanges } from '@draftila/engine/scene-graph';
import {
  getResolvedShapes,
  getResolvedShape,
  buildVariableTable,
  getResolvedPageBackgroundColor,
  observeVariables,
  observePages,
  DEFAULT_PAGE_BACKGROUND,
  observeGuides,
  setActivePageForGuides,
} from '@draftila/engine';
import {
  renderShape,
  getCornerRadii,
  simplifyShapeForZoom,
  textLegibilityForVisibleShapes,
} from '@draftila/engine/shape-renderer';
import { getMoveTool, getNodeTool } from '@draftila/engine/tools/tool-manager';
import { useEditorStore } from '@/stores/editor-store';
import { measure, record, setValue } from '@/lib/perf-metrics';
import { type SceneCache } from './use-tool';
import { FrameRasterCache, bitmapSizeFor, lodScaleFor, zoomBucketFor } from './canvas-frame-cache';
import {
  ensureFontsLoaded,
  onFontsLoaded,
  collectFontFamilies,
} from '@draftila/engine/font-manager';
import { onImageLoaded } from '@draftila/engine/image-cache';
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
import { updateLayoutAnimation, isLayoutAnimating, getAnimatingIds } from './layout-animation';

const DRAW_RATIO_WINDOW = 60;
const CULL_MARGIN = 512;

function collectTransientIds(tc: TransformContext, moveTool: ReturnType<typeof getMoveTool>) {
  const ids = new Set<string>();
  const add = (source: ReadonlyMap<string, unknown> | null) => {
    if (!source) return;
    for (const id of source.keys()) ids.add(id);
  };
  add(tc.dragPositions);
  add(tc.resizePreview);
  add(tc.rotationPreview);
  add(moveTool.getAutoLayoutPreview());
  const endpoint = tc.endpointPreview;
  if (endpoint) ids.add(endpoint.shapeId);
  for (const id of getAnimatingIds()) ids.add(id);
  return ids;
}

const CACHE_ZOOM_THRESHOLD = 0.35;
const CACHE_SHAPE_THRESHOLD = 1500;

function topLevelFrameFor(id: string, shapeMap: ReadonlyMap<string, Shape>): string {
  let current = shapeMap.get(id);
  if (!current) return id;
  let topId = current.id;
  while (current?.parentId) {
    const parent = shapeMap.get(current.parentId);
    if (!parent) break;
    topId = parent.id;
    current = parent;
  }
  return topId;
}

function isDescendantOf(
  shape: Shape,
  ancestorId: string,
  shapeMap: ReadonlyMap<string, Shape>,
): boolean {
  let parentId = shape.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = shapeMap.get(parentId)?.parentId ?? null;
  }
  return false;
}

function bakeFrame(
  frame: Shape,
  shapes: readonly Shape[],
  shapeMap: ReadonlyMap<string, Shape>,
  bucket: number,
  dpr: number,
  textLegibilityPx: number,
  isShapeVisible: (shape: Shape) => boolean,
): { canvas: HTMLCanvasElement; scale: number } | null {
  const size = bitmapSizeFor(frame.width, frame.height, bucket, dpr);
  if (!size) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const offscreen = new Canvas2DRenderer(canvas);
  offscreen.resize(frame.width, frame.height, size.scale);
  offscreen.clear();
  offscreen.save();
  offscreen.applyCamera({ x: -frame.x, y: -frame.y, zoom: 1 });

  const subtree: Shape[] = [];
  for (const shape of shapes) {
    if (shape.id === frame.id || isDescendantOf(shape, frame.id, shapeMap)) subtree.push(shape);
  }

  const clipStack: string[] = [];
  for (const shape of subtree) {
    while (clipStack.length > 0) {
      const clipParentId = clipStack[clipStack.length - 1]!;
      if (!isDescendantOf(shape, clipParentId, shapeMap)) {
        offscreen.endClip();
        clipStack.pop();
      } else {
        break;
      }
    }

    if (!isShapeVisible(shape)) continue;
    renderShape(offscreen, simplifyShapeForZoom(shape, bucket, textLegibilityPx));

    if (shape.type === 'frame' && (shape as Shape & { clip?: boolean }).clip !== false) {
      offscreen.beginClip(
        shape.x,
        shape.y,
        shape.width,
        shape.height,
        shape.rotation,
        getCornerRadii(shape as FrameShape),
      );
      clipStack.push(shape.id);
    }
  }

  while (clipStack.length > 0) {
    offscreen.endClip();
    clipStack.pop();
  }
  offscreen.restore();

  return { canvas, scale: size.scale };
}

export function useCanvas({ ydoc, sceneRef }: { ydoc: Y.Doc; sceneRef: RefObject<SceneCache> }) {
  const activePageId = useEditorStore((s) => s.activePageId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Canvas2DRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const shapeCacheRef = useRef<Shape[]>([]);
  const shapeMapRef = useRef<Map<string, Shape>>(new Map());
  const shapeIndexRef = useRef<Map<string, number>>(new Map());
  const framesRef = useRef<Shape[]>([]);
  const shapePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const needsRedrawRef = useRef(true);
  const frameCacheRef = useRef(new FrameRasterCache());
  const textLegibilityRef = useRef(0);

  const requestRedraw = useCallback(() => {
    needsRedrawRef.current = true;
  }, []);

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
      frameCacheRef.current.invalidateAll();
      requestRedraw();
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [requestRedraw]);

  const pageBgRef = useRef(DEFAULT_PAGE_BACKGROUND);

  useEffect(() => {
    const refresh = () => {
      const currentPageId = useEditorStore.getState().activePageId ?? activePageId;
      pageBgRef.current = currentPageId
        ? getResolvedPageBackgroundColor(ydoc, currentPageId)
        : DEFAULT_PAGE_BACKGROUND;
      frameCacheRef.current.invalidateAll();
      requestRedraw();
    };

    refresh();
    const unobservePages = observePages(ydoc, refresh);
    const unobserveVariables = observeVariables(ydoc, refresh);

    return () => {
      unobservePages();
      unobserveVariables();
    };
  }, [ydoc, activePageId, requestRedraw]);

  useEffect(() => {
    const patch = (updated: string[]): boolean => {
      const cache = shapeCacheRef.current;
      const index = shapeIndexRef.current;
      const table = buildVariableTable(ydoc);
      const resolvedById = new Map<string, Shape>();

      for (const id of updated) {
        const position = index.get(id);
        const previous = position === undefined ? undefined : cache[position];
        if (!previous || previous.id !== id) return false;
        const resolved = getResolvedShape(ydoc, id, table);
        if (!resolved) return false;
        if ((resolved.parentId ?? null) !== (previous.parentId ?? null)) return false;
        resolvedById.set(id, resolved);
      }

      const patched: Shape[] = [];
      for (const [id, resolved] of resolvedById) {
        const position = index.get(id)!;
        cache[position] = resolved;
        shapeMapRef.current.set(id, resolved);
        shapePositionsRef.current.set(id, { x: resolved.x, y: resolved.y });
        patched.push(resolved);
        frameCacheRef.current.invalidate(topLevelFrameFor(id, shapeMapRef.current));
      }
      if (patched.some((shape) => shape.type === 'frame')) {
        framesRef.current = shapeCacheRef.current.filter((shape) => shape.type === 'frame');
      }
      ensureFontsLoaded(collectFontFamilies(patched));
      requestRedraw();
      return true;
    };

    const refresh = (change?: ShapeChanges) => {
      if (change && isUpdateOnlyChange(change) && patch(change.updated)) return;
      if (change) {
        const previousMap = shapeMapRef.current;
        const touched = [...change.added, ...change.updated, ...change.deleted];
        if (touched.length === 0) {
          frameCacheRef.current.invalidateAll();
        }
        for (const id of touched) {
          frameCacheRef.current.invalidate(topLevelFrameFor(id, previousMap));
        }
      } else {
        frameCacheRef.current.invalidateAll();
      }
      shapeCacheRef.current = measure('yjs.getResolvedShapes', () => getResolvedShapes(ydoc));
      const nextMap = new Map<string, Shape>();
      const nextIndex = new Map<string, number>();
      const nextFrames: Shape[] = [];
      const nextPositions = new Map<string, { x: number; y: number }>();
      shapeCacheRef.current.forEach((shape, position) => {
        nextMap.set(shape.id, shape);
        nextIndex.set(shape.id, position);
        nextPositions.set(shape.id, { x: shape.x, y: shape.y });
        if (shape.type === 'frame') nextFrames.push(shape);
      });
      if (change) {
        for (const id of [...change.added, ...change.updated]) {
          frameCacheRef.current.invalidate(topLevelFrameFor(id, nextMap));
        }
      }
      shapeMapRef.current = nextMap;
      shapeIndexRef.current = nextIndex;
      framesRef.current = nextFrames;
      shapePositionsRef.current = nextPositions;
      setValue('shapes.total', shapeCacheRef.current.length);
      measure('fonts.ensureLoaded', () =>
        ensureFontsLoaded(collectFontFamilies(shapeCacheRef.current)),
      );
      requestRedraw();
    };

    refresh();

    const invalidateEverything = () => {
      frameCacheRef.current.invalidateAll();
      requestRedraw();
    };

    const unobserve = observeShapes(ydoc, refresh);
    const unobserveVariables = observeVariables(ydoc, () => refresh());
    const unsubscribeFonts = onFontsLoaded(invalidateEverything);
    const unsubscribeImages = onImageLoaded(invalidateEverything);

    return () => {
      unobserve();
      unobserveVariables();
      unsubscribeFonts();
      unsubscribeImages();
    };
  }, [ydoc, activePageId, requestRedraw]);

  useEffect(() => {
    if (activePageId) {
      setActivePageForGuides(ydoc, activePageId);
    }
    const unobserveGuides = observeGuides(ydoc, (guides) => {
      useEditorStore.getState().setGuides(guides);
      requestRedraw();
    });
    return unobserveGuides;
  }, [ydoc, activePageId, requestRedraw]);

  const draw = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const { camera, selectedIds, hoveredId, activeTool } = useEditorStore.getState();
    const shapes = shapeCacheRef.current;
    const shapeMap = shapeMapRef.current;

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
    updateLayoutAnimation(autoLayoutPreview, shapePositionsRef.current);

    const dragIds = tc.dragPositions;
    const deferredShapes: Shape[] = [];

    const viewport = renderer.getViewport(camera);
    const margin = CULL_MARGIN / camera.zoom;
    const visibleIds = new Set(
      sceneRef.current.spatialIndex
        .queryRect(
          viewport.minX - margin,
          viewport.minY - margin,
          viewport.maxX + margin,
          viewport.maxY + margin,
        )
        .map((box) => box.id),
    );

    const transientIds = collectTransientIds(tc, moveTool);
    for (const id of transientIds) visibleIds.add(id);

    for (const id of [...visibleIds]) {
      let parentId = shapeMap.get(id)?.parentId ?? null;
      while (parentId && !visibleIds.has(parentId)) {
        visibleIds.add(parentId);
        parentId = shapeMap.get(parentId)?.parentId ?? null;
      }
    }

    const cacheEngaged =
      camera.zoom < CACHE_ZOOM_THRESHOLD &&
      visibleIds.size > CACHE_SHAPE_THRESHOLD &&
      !dragIds &&
      transientIds.size === 0 &&
      !editingTextId &&
      !nodeEditingShapeId;
    const bucket = zoomBucketFor(camera.zoom);
    const lodScale = lodScaleFor(cacheEngaged, bucket, camera.zoom);

    const textLegibilityPx = textLegibilityForVisibleShapes(
      visibleIds.size,
      textLegibilityRef.current,
    );
    textLegibilityRef.current = textLegibilityPx;
    setValue('canvas.textLegibilityPx', textLegibilityPx);

    const clipStack: string[] = [];
    const shapeLoopStart = performance.now();
    let drawnCount = 0;
    let skipUntilOutsideFrame: string | null = null;

    for (const shape of shapes) {
      if (skipUntilOutsideFrame) {
        if (isDescendantOf(shape, skipUntilOutsideFrame, shapeMap)) continue;
        skipUntilOutsideFrame = null;
      }

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

      if (
        cacheEngaged &&
        shape.type === 'frame' &&
        !shape.parentId &&
        !shape.rotation &&
        visibleIds.has(shape.id) &&
        isShapeVisible(shape) &&
        (shape as Shape & { clip?: boolean }).clip !== false
      ) {
        let cached = frameCacheRef.current.get(shape.id, bucket, textLegibilityPx);
        if (!cached) {
          cached = bakeFrame(
            shape,
            shapes,
            shapeMap,
            bucket,
            window.devicePixelRatio || 1,
            textLegibilityPx,
            isShapeVisible,
          );
          if (cached) {
            frameCacheRef.current.set(
              shape.id,
              bucket,
              textLegibilityPx,
              cached.canvas,
              cached.scale,
            );
          }
        }

        if (cached) {
          renderer.drawCachedFrame(cached.canvas, shape.x, shape.y, shape.width, shape.height);
          drawnCount++;
          skipUntilOutsideFrame = shape.id;
          continue;
        }
      }

      if (!isShapeVisible(shape)) continue;

      if (dragIds && dragIds.has(shape.id)) {
        deferredShapes.push(shape);
        continue;
      }

      if (!visibleIds.has(shape.id)) continue;

      let displayShape = applyTransforms(shape, tc);

      if (nodeEditingShapeId && nodePreviewPathData && shape.id === nodeEditingShapeId) {
        displayShape = {
          ...displayShape,
          svgPathData: nodePreviewPathData,
        } as Shape;
      }

      renderShape(renderer, simplifyShapeForZoom(displayShape, lodScale, textLegibilityPx));
      drawnCount++;

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
      drawnCount++;
    }

    record('canvas.shapePass', performance.now() - shapeLoopStart);
    setValue('shapes.drawn', drawnCount);

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
      selectedIds,
      shapeMap,
      tc,
      isShapeVisible,
      camera.zoom,
    );

    renderFrameLabels(
      renderer,
      framesRef.current,
      shapeMap,
      selectedSet,
      tc,
      isShapeVisible,
      camera.zoom,
      visibleIds,
    );

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
    const unsubscribeStore = useEditorStore.subscribe((state, prev) => {
      if (
        state.camera !== prev.camera ||
        state.selectedIds !== prev.selectedIds ||
        state.hoveredId !== prev.hoveredId ||
        state.activeTool !== prev.activeTool ||
        state.editingTextId !== prev.editingTextId ||
        state.enteredGroupId !== prev.enteredGroupId ||
        state.guides !== prev.guides ||
        state.selectedGuideId !== prev.selectedGuideId ||
        state.draggingGuide !== prev.draggingGuide ||
        state.guidesVisible !== prev.guidesVisible ||
        state.rulersVisible !== prev.rulersVisible ||
        state.aiActiveFrameIds !== prev.aiActiveFrameIds ||
        state.isPanning !== prev.isPanning ||
        state.isDrawing !== prev.isDrawing
      ) {
        requestRedraw();
      }
    });

    let drawnFrames = 0;
    let totalFrames = 0;

    const renderLoop = () => {
      const state = useEditorStore.getState();
      const moveTool = getMoveTool();
      const isContinuous =
        state.isDrawing ||
        state.isPanning ||
        state.aiActiveFrameIds.size > 0 ||
        moveTool.marqueeRect !== null ||
        moveTool.getDragPositions() !== null ||
        moveTool.getResizePreview() !== null ||
        moveTool.getRotationPreview() !== null ||
        moveTool.getEndpointPreview() !== null ||
        moveTool.getAutoLayoutPreview() !== null ||
        (state.activeTool === 'node' && getNodeTool().getEditingShapeId() !== null) ||
        isLayoutAnimating();

      totalFrames++;
      if (isContinuous || needsRedrawRef.current) {
        needsRedrawRef.current = false;
        drawnFrames++;
        measure('canvas.frame', draw);
      }

      if (totalFrames >= DRAW_RATIO_WINDOW) {
        setValue('canvas.drawRatio', drawnFrames / totalFrames);
        drawnFrames = 0;
        totalFrames = 0;
      }

      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      unsubscribeStore();
    };
  }, [draw, requestRedraw]);

  return { canvasRef };
}
