import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { screenToCanvas } from '@draftila/engine/camera';
import { getTool, getMoveTool } from '@draftila/engine/tools/tool-manager';
import type { ToolContext } from '@draftila/engine/tools/base-tool';
import type { HandTool } from '@draftila/engine/tools/hand-tool';
import {
  getAllShapes,
  getShape,
  isUpdateOnlyChange,
  observeShapes,
} from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { useEditorStore } from '@/stores/editor-store';
import { measure } from '@/lib/perf-metrics';

interface UseToolOptions {
  ydoc: Y.Doc;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  sceneRef: React.RefObject<SceneCache>;
  onActiveInteraction?: (cursor: { x: number; y: number } | null) => void;
}

function buildContext(
  e: {
    clientX: number;
    clientY: number;
    button?: number;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  },
  ydoc: Y.Doc,
  canvasRect: DOMRect,
  scene: SceneCache,
): ToolContext {
  const camera = useEditorStore.getState().camera;
  const screenX = e.clientX - canvasRect.left;
  const screenY = e.clientY - canvasRect.top;
  const canvasPoint = screenToCanvas(screenX, screenY, camera);

  return {
    ydoc,
    camera,
    canvasPoint,
    screenPoint: { x: screenX, y: screenY },
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    button: e.button ?? 0,
    shapes: scene.shapes,
    shapeMap: scene.shapeMap,
    spatialIndex: scene.spatialIndex,
  };
}

export interface SceneCache {
  shapes: Shape[];
  shapeMap: Map<string, Shape>;
  indexById: Map<string, number>;
  spatialIndex: SpatialIndex;
}

export function createSceneCache(): SceneCache {
  return {
    shapes: [],
    shapeMap: new Map(),
    indexById: new Map(),
    spatialIndex: new SpatialIndex(),
  };
}

export function useTool({ ydoc, canvasRef, sceneRef, onActiveInteraction }: UseToolOptions) {
  const activePageId = useEditorStore((s) => s.activePageId);
  const spaceHeldRef = useRef(false);
  const middleClickPanRef = useRef(false);
  const pointerDownRef = useRef(false);
  const onActiveInteractionRef = useRef(onActiveInteraction);
  onActiveInteractionRef.current = onActiveInteraction;

  const isPanningRef = useRef(false);
  const startPan = useCallback(() => {
    if (isPanningRef.current) return;
    isPanningRef.current = true;
    useEditorStore.getState().setIsPanning(true);
  }, []);

  const stopPan = useCallback(() => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    const handTool = getTool('hand') as HandTool;
    handTool.onDeactivate();
    useEditorStore.getState().setIsPanning(false);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = buildContext(e, ydoc, rect, sceneRef.current);
      canvas.setPointerCapture(e.pointerId);
      pointerDownRef.current = true;

      if (e.button === 1) {
        middleClickPanRef.current = true;
        startPan();
        const handTool = getTool('hand') as HandTool;
        handTool.onPointerDown(ctx);
        return;
      }

      if (spaceHeldRef.current) {
        startPan();
        const handTool = getTool('hand') as HandTool;
        handTool.onPointerDown(ctx);
        return;
      }

      const activeTool = useEditorStore.getState().activeTool;
      const tool = getTool(activeTool);
      tool.onPointerDown(ctx);
    },
    [ydoc, canvasRef, startPan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = buildContext(e, ydoc, rect, sceneRef.current);

      useEditorStore.getState().setCursorCanvasPoint(ctx.canvasPoint);

      if (pointerDownRef.current) {
        const { isDrawing } = useEditorStore.getState();
        if (isDrawing || getMoveTool().isManipulating) {
          onActiveInteractionRef.current?.(ctx.canvasPoint);
        }
      }

      if (isPanningRef.current) {
        const handTool = getTool('hand') as HandTool;
        handTool.onPointerMove(ctx);
        return;
      }

      const activeTool = useEditorStore.getState().activeTool;
      const tool = getTool(activeTool);
      tool.onPointerMove(ctx);
    },
    [ydoc, canvasRef],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = buildContext(e, ydoc, rect, sceneRef.current);
      canvas.releasePointerCapture(e.pointerId);
      const wasManipulating = useEditorStore.getState().isDrawing || getMoveTool().isManipulating;
      pointerDownRef.current = false;
      if (wasManipulating) {
        onActiveInteractionRef.current?.(null);
      }

      if (e.button === 1) {
        middleClickPanRef.current = false;
        const handTool = getTool('hand') as HandTool;
        handTool.onPointerUp(ctx);
        if (!spaceHeldRef.current) {
          stopPan();
        }
        return;
      }

      if (isPanningRef.current) {
        const handTool = getTool('hand') as HandTool;
        handTool.onPointerUp(ctx);
        if (!spaceHeldRef.current && !middleClickPanRef.current) {
          stopPan();
        }
        return;
      }

      const activeTool = useEditorStore.getState().activeTool;
      const tool = getTool(activeTool);
      tool.onPointerUp(ctx);
    },
    [ydoc, canvasRef, stopPan],
  );

  useEffect(() => {
    function rebuildSpatialCache() {
      measure('yjs.rebuildSpatialCache', () => {
        const shapes = getAllShapes(ydoc);
        const spatialIndex = new SpatialIndex();
        spatialIndex.rebuild(shapes);
        const shapeMap = new Map<string, Shape>();
        const indexById = new Map<string, number>();
        shapes.forEach((shape, index) => {
          shapeMap.set(shape.id, shape);
          indexById.set(shape.id, index);
        });
        sceneRef.current = { shapes, shapeMap, indexById, spatialIndex };
      });
    }

    function patchSpatialCache(updated: string[]): boolean {
      const scene = sceneRef.current;
      for (const id of updated) {
        const index = scene.indexById.get(id);
        if (index === undefined || scene.shapes[index]?.id !== id) return false;
      }

      for (const id of updated) {
        const shape = getShape(ydoc, id);
        if (!shape) return false;
        scene.spatialIndex.update(shape);
        scene.shapeMap.set(id, shape);
        scene.shapes[scene.indexById.get(id)!] = shape;
      }
      return true;
    }

    rebuildSpatialCache();
    const unobserveShapes = observeShapes(ydoc, (changes) => {
      if (isUpdateOnlyChange(changes) && patchSpatialCache(changes.updated)) return;
      rebuildSpatialCache();
    });

    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.activeTool === prev.activeTool) return;
      const prevTool = getTool(prev.activeTool);
      const nextTool = getTool(state.activeTool);
      prevTool.onDeactivate();
      nextTool.onActivate();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spaceHeldRef.current = true;
        startPan();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        if (!middleClickPanRef.current) {
          stopPan();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      unobserveShapes();
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [ydoc, activePageId, startPan, stopPan]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
