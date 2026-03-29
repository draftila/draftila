import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { screenToCanvas } from '@draftila/engine/camera';
import { getTool, getMoveTool } from '@draftila/engine/tools/tool-manager';
import type { ToolContext } from '@draftila/engine/tools/base-tool';
import type { HandTool } from '@draftila/engine/tools/hand-tool';
import { hitTestPoint } from '@draftila/engine/hit-test';
import { getAllShapes, resolveGroupTarget } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { useEditorStore } from '@/stores/editor-store';

interface UseToolOptions {
  ydoc: Y.Doc;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
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
  };
}

export function useTool({ ydoc, canvasRef, onActiveInteraction }: UseToolOptions) {
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
      const ctx = buildContext(e, ydoc, rect);
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

      if (useEditorStore.getState().devMode && activeTool !== 'comment') {
        const shapes = getAllShapes(ydoc);
        const spatialIndex = new SpatialIndex();
        spatialIndex.rebuild(shapes);
        const hit = hitTestPoint(
          ctx.canvasPoint.x,
          ctx.canvasPoint.y,
          shapes,
          spatialIndex,
          ctx.camera.zoom,
        );
        const store = useEditorStore.getState();
        if (hit) {
          const targetId = resolveGroupTarget(ydoc, hit.id, store.enteredGroupId);
          if (ctx.shiftKey) {
            store.toggleSelection(targetId);
          } else {
            store.setSelectedIds([targetId]);
          }
        } else if (!ctx.shiftKey) {
          store.clearSelection();
        }
        return;
      }

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
      const ctx = buildContext(e, ydoc, rect);

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

      const activeTool2 = useEditorStore.getState().activeTool;

      if (useEditorStore.getState().devMode && activeTool2 !== 'comment') {
        const shapes = getAllShapes(ydoc);
        const spatialIndex = new SpatialIndex();
        spatialIndex.rebuild(shapes);
        const hit = hitTestPoint(
          ctx.canvasPoint.x,
          ctx.canvasPoint.y,
          shapes,
          spatialIndex,
          ctx.camera.zoom,
        );
        const store = useEditorStore.getState();
        if (hit) {
          const targetId = resolveGroupTarget(ydoc, hit.id, store.enteredGroupId);
          store.setHoveredId(targetId);
        } else {
          store.setHoveredId(null);
        }
        return;
      }

      const tool = getTool(activeTool2);
      tool.onPointerMove(ctx);
    },
    [ydoc, canvasRef],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = buildContext(e, ydoc, rect);
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

      const activeTool3 = useEditorStore.getState().activeTool;

      if (useEditorStore.getState().devMode && activeTool3 !== 'comment') {
        return;
      }

      const tool = getTool(activeTool3);
      tool.onPointerUp(ctx);
    },
    [ydoc, canvasRef, stopPan],
  );

  useEffect(() => {
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
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startPan, stopPan]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
