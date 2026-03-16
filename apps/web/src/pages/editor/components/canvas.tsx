import { useCallback, useEffect } from 'react';
import type * as Y from 'yjs';
import { useEditorStore } from '@/stores/editor-store';
import { zoomAtPoint, panCamera, screenToCanvas } from '@draftila/engine/camera';
import { getShape, resolveGroupTarget } from '@draftila/engine/scene-graph';
import { hitTestPoint } from '@draftila/engine/hit-test';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { setTextToolCallback } from '@draftila/engine/tools/tool-manager';
import { useCanvas, getCursorForTool } from '../hooks/use-canvas';
import { useTool } from '../hooks/use-tool';
import { EditorToolbar } from './editor-toolbar';
import { CursorOverlay } from './cursor-overlay';
import { TextEditOverlay } from './text-edit-overlay';
import type { RemoteUser } from '../hooks/use-awareness';

interface CanvasProps {
  ydoc: Y.Doc;
  remoteUsers: RemoteUser[];
  onActiveInteraction?: (cursor: { x: number; y: number } | null) => void;
}

const ZOOM_SENSITIVITY = 0.002;

export function Canvas({ ydoc, remoteUsers, onActiveInteraction }: CanvasProps) {
  const { canvasRef } = useCanvas({ ydoc });
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useTool({
    ydoc,
    canvasRef,
    onActiveInteraction,
  });
  const activeTool = useEditorStore((s) => s.activeTool);
  const isPanning = useEditorStore((s) => s.isPanning);
  const camera = useEditorStore((s) => s.camera);
  const editingTextId = useEditorStore((s) => s.editingTextId);

  useEffect(() => {
    setTextToolCallback((shapeId: string) => {
      useEditorStore.getState().setEditingTextId(shapeId);
    });
    return () => setTextToolCallback(null);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const { camera: cam, setCamera } = useEditorStore.getState();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
        const newZoom = cam.zoom * (1 + zoomDelta);
        setCamera(zoomAtPoint(cam, screenX, screenY, newZoom));
      } else {
        setCamera(panCamera(cam, -e.deltaX, -e.deltaY));
      }
    },
    [canvasRef],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      if (state.activeTool !== 'move') return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const point = screenToCanvas(sx, sy, state.camera);

      const shapes = getAllShapes(ydoc);
      const spatialIndex = new SpatialIndex();
      spatialIndex.rebuild(shapes);
      const hit = hitTestPoint(point.x, point.y, shapes, spatialIndex, state.camera.zoom);

      if (!hit) return;

      const targetId = resolveGroupTarget(ydoc, hit.id, state.enteredGroupId);
      const targetShape = getShape(ydoc, targetId);
      if (!targetShape) return;

      if (targetShape.type === 'group') {
        state.setEnteredGroupId(targetId);
        const deeperTargetId = resolveGroupTarget(ydoc, hit.id, targetId);
        state.setSelectedIds([deeperTargetId]);
        return;
      }

      if (targetShape.type === 'text') {
        state.setSelectedIds([targetShape.id]);
        state.setEditingTextId(targetShape.id);
      }
    },
    [ydoc, canvasRef],
  );

  const wrappedPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editingTextId) {
        return;
      }
      handlePointerDown(e);
    },
    [handlePointerDown, editingTextId],
  );

  const wrappedPointerMove = useCallback(
    (e: React.PointerEvent) => {
      handlePointerMove(e);
    },
    [handlePointerMove],
  );

  const cursor = getCursorForTool(activeTool, isPanning);

  return (
    <div className="bg-muted/30 relative flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor, touchAction: 'none' }}
        onWheel={handleWheel}
        onPointerDown={wrappedPointerDown}
        onPointerMove={wrappedPointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      <TextEditOverlay ydoc={ydoc} camera={camera} />
      <CursorOverlay remoteUsers={remoteUsers} camera={camera} />
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <EditorToolbar />
      </div>
    </div>
  );
}
