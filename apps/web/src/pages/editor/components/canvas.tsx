import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { useEditorStore } from '@/stores/editor-store';
import { zoomAtPoint, panCamera, screenToCanvas } from '@draftila/engine/camera';
import { getShape, resolveGroupTarget } from '@draftila/engine/scene-graph';
import { hitTestPoint } from '@draftila/engine/hit-test';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import { getNodeTool, setTextToolCallback } from '@draftila/engine/tools/tool-manager';
import { DEFAULT_PAGE_BACKGROUND } from '@draftila/engine';
import { useCanvas, getCursorForTool } from '../hooks/use-canvas';
import { useTool } from '../hooks/use-tool';
import { useFileDrop } from '../hooks/use-file-drop';
import { EditorToolbar } from './editor-toolbar';
import { CursorOverlay } from './cursor-overlay';
import { TextEditOverlay } from './text-edit-overlay';
import { CanvasContextMenu } from './canvas-context-menu';
import type { RemoteUser } from '../hooks/use-awareness';

interface CanvasProps {
  ydoc: Y.Doc;
  remoteUsers: RemoteUser[];
  onActiveInteraction?: (cursor: { x: number; y: number } | null) => void;
}

interface ContextMenuState {
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
}

const ZOOM_SENSITIVITY = 0.002;

export function Canvas({ ydoc, remoteUsers, onActiveInteraction }: CanvasProps) {
  const { canvasRef } = useCanvas({ ydoc });
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useTool({
    ydoc,
    canvasRef,
    onActiveInteraction,
  });
  const { isDragging } = useFileDrop({ ydoc, canvasRef });
  const activeTool = useEditorStore((s) => s.activeTool);
  const isPanning = useEditorStore((s) => s.isPanning);
  const camera = useEditorStore((s) => s.camera);
  const editingTextId = useEditorStore((s) => s.editingTextId);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTextToolCallback((shapeId: string) => {
      useEditorStore.getState().setEditingTextId(shapeId);
    });
    return () => setTextToolCallback(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };

    const handleScroll = () => setContextMenu(null);

    window.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setContextMenu(null);
      const { camera: cam, setCamera } = useEditorStore.getState();
      const rect = el.getBoundingClientRect();

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
        const newZoom = cam.zoom * (1 + zoomDelta);
        setCamera(zoomAtPoint(cam, screenX, screenY, newZoom));
      } else {
        setCamera(panCamera(cam, -e.deltaX, -e.deltaY));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [canvasRef]);

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
        return;
      }

      if (getNodeTool().canEditShape(ydoc, targetShape.id)) {
        state.setSelectedIds([targetShape.id]);
        state.setActiveTool('node');
        getNodeTool().enterPathEditingForShape(ydoc, targetShape.id);
      }
    },
    [ydoc, canvasRef],
  );

  const wrappedPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setContextMenu(null);
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const canvasPoint = screenToCanvas(sx, sy, useEditorStore.getState().camera);

      const state = useEditorStore.getState();
      const shapes = getAllShapes(ydoc);
      const spatialIndex = new SpatialIndex();
      spatialIndex.rebuild(shapes);
      const hit = hitTestPoint(
        canvasPoint.x,
        canvasPoint.y,
        shapes,
        spatialIndex,
        state.camera.zoom,
      );

      if (hit) {
        const targetId = resolveGroupTarget(ydoc, hit.id, state.enteredGroupId);
        if (!state.selectedIds.includes(targetId)) {
          useEditorStore.getState().setSelectedIds([targetId]);
        }
      }

      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        canvasPosition: canvasPoint,
      });
    },
    [ydoc, canvasRef],
  );

  const cursor = getCursorForTool(activeTool, isPanning);

  return (
    <div
      className="relative flex-1 overflow-hidden"
      style={{ backgroundColor: DEFAULT_PAGE_BACKGROUND }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={wrappedPointerDown}
        onPointerMove={wrappedPointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
      {isDragging && (
        <div className="border-primary/50 bg-primary/5 pointer-events-none absolute inset-4 rounded-xl border-2 border-dashed">
          <div className="flex h-full items-center justify-center">
            <p className="text-primary text-sm font-medium">Drop files to import</p>
          </div>
        </div>
      )}
      {contextMenu && (
        <CanvasContextMenu
          ref={contextMenuRef}
          ydoc={ydoc}
          position={contextMenu.position}
          canvasPosition={contextMenu.canvasPosition}
          onClose={() => setContextMenu(null)}
        />
      )}
      <TextEditOverlay ydoc={ydoc} camera={camera} />
      <CursorOverlay remoteUsers={remoteUsers} camera={camera} />
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <EditorToolbar />
      </div>
    </div>
  );
}
