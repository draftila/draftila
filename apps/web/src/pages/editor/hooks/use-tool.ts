import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { screenToCanvas } from '@draftila/engine/camera';
import { getTool } from '@draftila/engine/tools/tool-manager';
import type { ToolContext } from '@draftila/engine/tools/base-tool';
import type { HandTool } from '@draftila/engine/tools/hand-tool';
import { useEditorStore } from '@/stores/editor-store';

interface UseToolOptions {
  ydoc: Y.Doc;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
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

export function useTool({ ydoc, canvasRef }: UseToolOptions) {
  const spaceHeldRef = useRef(false);
  const middleClickPanRef = useRef(false);

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
      const ctx = buildContext(e, ydoc, rect);

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
      const ctx = buildContext(e, ydoc, rect);
      canvas.releasePointerCapture(e.pointerId);

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
