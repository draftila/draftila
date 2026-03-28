import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { useQueryClient } from '@tanstack/react-query';
import { useEditorStore } from '@/stores/editor-store';
import { zoomAtPoint, panCamera, screenToCanvas, canvasToScreen } from '@draftila/engine/camera';
import { hitTestGuide, observeShapes } from '@draftila/engine';
import {
  addCommentPin,
  bumpCommentRevision,
  deleteCommentPin,
  getCommentPinCanvasPosition,
  observeCommentPins,
  observeCommentRevision,
  setCommentPinParent,
} from '@draftila/engine';
import { findContainerAtPoint, getShape, resolveGroupTarget } from '@draftila/engine/scene-graph';
import { hitTestPoint } from '@draftila/engine/hit-test';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { SpatialIndex } from '@draftila/engine/spatial-index';
import {
  getMoveTool,
  getNodeTool,
  setCommentToolCallback,
  setTextToolCallback,
} from '@draftila/engine/tools/tool-manager';
import { DEFAULT_PAGE_BACKGROUND } from '@draftila/engine';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useMarkCommentRead,
  useToggleCommentResolved,
} from '@/api/comments';
import { useCanvas } from '../hooks/use-canvas';
import { getCursorForTool } from '../hooks/canvas-utils';
import { useTool } from '../hooks/use-tool';
import { useFileDrop } from '../hooks/use-file-drop';
import { EditorToolbar } from './editor-toolbar';
import { CursorOverlay } from './cursor-overlay';
import { TextEditOverlay } from './text-edit-overlay';
import { CanvasContextMenu } from './canvas-context-menu';
import { Ruler, RulerCorner } from './rulers';
import type { RemoteUser } from '../hooks/use-awareness';
import type { CommentPin } from '@draftila/engine';
import type { CommentResponse } from '@draftila/shared';
import { CommentBubble } from './comment-bubble';
import { CommentThreadPanel } from './comment-thread-panel';

interface CanvasProps {
  ydoc: Y.Doc;
  draftId: string;
  userId: string;
  userName: string;
  remoteUsers: RemoteUser[];
  onActiveInteraction?: (cursor: { x: number; y: number } | null) => void;
}

interface ContextMenuState {
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
}

const ZOOM_SENSITIVITY = 0.002;
const NEW_COMMENT_SENTINEL = '__new__';

function collectThreadRoots(threads: CommentResponse[]): Map<string, CommentResponse> {
  const roots = new Map<string, CommentResponse>();
  for (const thread of threads) {
    roots.set(thread.id, thread);
    const stack = [...thread.replies];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      roots.set(node.id, thread);
      for (const reply of node.replies) {
        stack.push(reply);
      }
    }
  }
  return roots;
}

function getCommentPinLivePosition(ydoc: Y.Doc, pin: CommentPin): { x: number; y: number } {
  const base = getCommentPinCanvasPosition(ydoc, pin);
  if (!pin.parentShapeId) return base;

  const moveTool = getMoveTool();
  const dragPositions = moveTool.getDragPositions();
  if (dragPositions?.has(pin.parentShapeId)) {
    const parent = getShape(ydoc, pin.parentShapeId);
    if (parent) {
      const livePos = dragPositions.get(pin.parentShapeId)!;
      return { x: livePos.x + pin.x, y: livePos.y + pin.y };
    }
  }

  const resizePreview = moveTool.getResizePreview();
  const resizeEntry = resizePreview?.get(pin.parentShapeId);
  if (resizeEntry) {
    return { x: resizeEntry.x + pin.x, y: resizeEntry.y + pin.y };
  }

  return base;
}

function findCommentAttachmentTarget(
  ydoc: Y.Doc,
  x: number,
  y: number,
  zoom: number,
): string | null {
  const shapes = getAllShapes(ydoc);
  const spatialIndex = new SpatialIndex();
  spatialIndex.rebuild(shapes);
  const hit = hitTestPoint(x, y, shapes, spatialIndex, zoom);
  if (hit) {
    return hit.id;
  }
  return findContainerAtPoint(ydoc, x, y);
}

export function Canvas({
  ydoc,
  draftId,
  userId,
  userName,
  remoteUsers,
  onActiveInteraction,
}: CanvasProps) {
  const { canvasRef } = useCanvas({ ydoc });
  const queryClient = useQueryClient();
  const { handlePointerDown, handlePointerMove, handlePointerUp } = useTool({
    ydoc,
    canvasRef,
    onActiveInteraction,
  });
  const { isDragging } = useFileDrop({ ydoc, canvasRef });
  const activeTool = useEditorStore((s) => s.activeTool);
  const activePageId = useEditorStore((s) => s.activePageId);
  const commentsVisible = useEditorStore((s) => s.commentsVisible);
  const activeCommentId = useEditorStore((s) => s.activeCommentId);
  const isPanning = useEditorStore((s) => s.isPanning);
  const camera = useEditorStore((s) => s.camera);
  const editingTextId = useEditorStore((s) => s.editingTextId);
  const rulersVisible = useEditorStore((s) => s.rulersVisible);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const commentPanelRef = useRef<HTMLDivElement | null>(null);
  const [commentPins, setCommentPins] = useState<CommentPin[]>([]);
  const [pendingPlacement, setPendingPlacement] = useState<{
    x: number;
    y: number;
    parentShapeId: string | null;
  } | null>(null);
  const [pinDragPreview, setPinDragPreview] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [pinDropTargetId, setPinDropTargetId] = useState<string | null>(null);
  const dragRef = useRef<{
    pinId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const { data: threads = [] } = useComments(draftId, activePageId);
  const createComment = useCreateComment(draftId);
  const deleteComment = useDeleteComment();
  const toggleResolved = useToggleCommentResolved();
  const markCommentRead = useMarkCommentRead();

  const threadRootById = useMemo(() => collectThreadRoots(threads), [threads]);
  const activeThread = activeCommentId ? (threadRootById.get(activeCommentId) ?? null) : null;

  useEffect(() => {
    setTextToolCallback((shapeId: string) => {
      useEditorStore.getState().setEditingTextId(shapeId);
    });
    return () => {
      setTextToolCallback(null);
    };
  }, []);

  const [shapeRevision, setShapeRevision] = useState(0);

  useEffect(() => {
    if (!activePageId) {
      setCommentPins([]);
      return;
    }

    return observeCommentPins(ydoc, setCommentPins, activePageId);
  }, [ydoc, activePageId]);

  useEffect(() => {
    return observeCommentRevision(ydoc, () => {
      queryClient.invalidateQueries({ queryKey: ['comments', draftId] });
    });
  }, [ydoc, draftId, queryClient]);

  useEffect(() => {
    return observeShapes(ydoc, () => {
      setShapeRevision((r) => r + 1);
    });
  }, [ydoc]);

  const hasParentedPins = commentPins.some((p) => p.parentShapeId);

  useEffect(() => {
    if (!hasParentedPins) return;

    let raf = 0;
    let wasManipulating = false;
    const tick = () => {
      const manipulating = getMoveTool().isManipulating;
      if (manipulating) {
        setShapeRevision((r) => r + 1);
        wasManipulating = true;
      } else if (wasManipulating) {
        wasManipulating = false;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasParentedPins]);

  useEffect(() => {
    setCommentToolCallback((placement) => {
      setPendingPlacement(placement);
      useEditorStore.getState().setCommentsVisible(true);
      useEditorStore.getState().setActiveCommentId(NEW_COMMENT_SENTINEL);
    });

    return () => {
      setCommentToolCallback(null);
    };
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
      } else {
        const guideHit = hitTestGuide(canvasPoint, state.guides, state.camera.zoom);
        if (guideHit) {
          useEditorStore.getState().setSelectedGuideId(guideHit);
        }
      }

      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        canvasPosition: canvasPoint,
      });
    },
    [ydoc, canvasRef],
  );

  const handleCommentCreate = useCallback(
    async (content: string) => {
      if (!activePageId || !pendingPlacement) return;
      const created = await createComment.mutateAsync({
        pageId: activePageId,
        content,
      });

      let pinX = pendingPlacement.x;
      let pinY = pendingPlacement.y;
      const parentShapeId = pendingPlacement.parentShapeId;
      if (parentShapeId) {
        const parent = getShape(ydoc, parentShapeId);
        if (parent) {
          pinX = pendingPlacement.x - parent.x;
          pinY = pendingPlacement.y - parent.y;
        }
      }

      addCommentPin(ydoc, {
        commentId: created.id,
        pageId: activePageId,
        x: pinX,
        y: pinY,
        parentShapeId,
        userId,
        userName,
      });
      bumpCommentRevision(ydoc);
      setPendingPlacement(null);
      useEditorStore.getState().setActiveCommentId(created.id);
      useEditorStore.getState().setActiveTool('move');
    },
    [activePageId, createComment, pendingPlacement, userId, userName, ydoc],
  );

  const handleReply = useCallback(
    async (parentId: string, content: string) => {
      if (!activePageId) return;
      await createComment.mutateAsync({ pageId: activePageId, content, parentId });
      bumpCommentRevision(ydoc);
    },
    [activePageId, createComment, ydoc],
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      await deleteComment.mutateAsync({ commentId });
      deleteCommentPin(ydoc, commentId);
      bumpCommentRevision(ydoc);
      if (activeCommentId === commentId) {
        useEditorStore.getState().setActiveCommentId(null);
      }
    },
    [activeCommentId, deleteComment, ydoc],
  );

  const handleResolveToggle = useCallback(
    async (commentId: string) => {
      await toggleResolved.mutateAsync({ commentId });
      bumpCommentRevision(ydoc);
    },
    [toggleResolved, ydoc],
  );

  const openThreadById = useCallback(
    async (commentId: string) => {
      useEditorStore.getState().setActiveCommentId(commentId);
      setPendingPlacement(null);
      await markCommentRead.mutateAsync({ commentId });
    },
    [markCommentRead],
  );

  const handlePinPointerMove = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas || drag.pointerId !== pointerId) return;

      const rect = canvas.getBoundingClientRect();
      const point = screenToCanvas(clientX - rect.left, clientY - rect.top, camera);
      const x = point.x + drag.offsetX;
      const y = point.y + drag.offsetY;

      if (!drag.moved) {
        const currentPin = commentPins.find((pin) => pin.commentId === drag.pinId);
        if (currentPin) {
          const current = getCommentPinCanvasPosition(ydoc, currentPin);
          if (Math.abs(current.x - x) > 1 || Math.abs(current.y - y) > 1) {
            drag.moved = true;
          }
        }
      }

      const targetId = findCommentAttachmentTarget(ydoc, x, y, camera.zoom);
      setPinDropTargetId(targetId);
      useEditorStore.getState().setHoveredId(targetId);

      setPinDragPreview((prev) => ({ ...prev, [drag.pinId]: { x, y } }));
    },
    [camera, canvasRef, commentPins, ydoc],
  );

  const handlePinPointerUp = useCallback(
    (pointerId: number, clientX: number, clientY: number, shouldCommit: boolean) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas || drag.pointerId !== pointerId) return;

      const rect = canvas.getBoundingClientRect();
      const point = screenToCanvas(clientX - rect.left, clientY - rect.top, camera);
      const x = point.x + drag.offsetX;
      const y = point.y + drag.offsetY;

      if (shouldCommit && drag.moved) {
        const targetParentId = findCommentAttachmentTarget(ydoc, x, y, camera.zoom);
        setCommentPinParent(ydoc, drag.pinId, targetParentId, x, y);
      } else if (shouldCommit) {
        void openThreadById(drag.pinId);
      }

      dragRef.current = null;
      setDraggingPinId(null);
      setPinDropTargetId(null);
      useEditorStore.getState().setHoveredId(null);
      setPinDragPreview((prev) => {
        const next = { ...prev };
        delete next[drag.pinId];
        return next;
      });
    },
    [camera, canvasRef, openThreadById, ydoc],
  );

  const startPinDrag = useCallback(
    (pin: CommentPin, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pointer = screenToCanvas(event.clientX - rect.left, event.clientY - rect.top, camera);
      const pinCanvas = getCommentPinCanvasPosition(ydoc, pin);
      dragRef.current = {
        pinId: pin.commentId,
        pointerId: event.pointerId,
        offsetX: pinCanvas.x - pointer.x,
        offsetY: pinCanvas.y - pointer.y,
        moved: false,
      };
      setDraggingPinId(pin.commentId);
      setPinDropTargetId(null);

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [camera, canvasRef, ydoc],
  );

  const pinViews = useMemo(() => {
    return commentPins.map((pin) => {
      const canvasPos = pinDragPreview[pin.commentId] ?? getCommentPinLivePosition(ydoc, pin);
      const screenPos = canvasToScreen(canvasPos.x, canvasPos.y, camera);
      return {
        pin,
        screenX: screenPos.x,
        screenY: screenPos.y,
        thread: threadRootById.get(pin.commentId) ?? null,
      };
    });
  }, [camera, commentPins, pinDragPreview, shapeRevision, threadRootById, ydoc]);

  const panelAnchor = useMemo(() => {
    if (pendingPlacement) {
      return canvasToScreen(pendingPlacement.x, pendingPlacement.y, camera);
    }
    if (!activeCommentId) {
      return null;
    }
    const activePin = pinViews.find((view) => view.pin.commentId === activeCommentId);
    if (!activePin) {
      return null;
    }
    return { x: activePin.screenX, y: activePin.screenY };
  }, [activeCommentId, camera, pendingPlacement, pinViews]);

  const hasOpenCommentPanel = !!(panelAnchor && (pendingPlacement || activeThread));

  useEffect(() => {
    if (!hasOpenCommentPanel) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (commentPanelRef.current?.contains(target)) {
        return;
      }

      const element = target instanceof Element ? target : null;
      if (element?.closest('[data-comment-bubble="true"]')) {
        return;
      }

      if (target === canvasRef.current && useEditorStore.getState().activeTool === 'comment') {
        return;
      }

      setPendingPlacement(null);
      useEditorStore.getState().setActiveCommentId(null);
      if (useEditorStore.getState().activeTool === 'comment') {
        useEditorStore.getState().setActiveTool('move');
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [hasOpenCommentPanel, canvasRef]);

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
      {commentsVisible &&
        pinViews.map(({ pin, screenX, screenY, thread }) => (
          <CommentBubble
            key={pin.commentId}
            x={screenX}
            y={screenY}
            thread={thread}
            active={activeCommentId === pin.commentId}
            dragging={draggingPinId === pin.commentId}
            onPointerDown={(event) => startPinDrag(pin, event)}
            onPointerMove={(event) => {
              handlePinPointerMove(event.pointerId, event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              handlePinPointerUp(event.pointerId, event.clientX, event.clientY, true);
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              handlePinPointerUp(event.pointerId, event.clientX, event.clientY, false);
            }}
          />
        ))}
      {pendingPlacement && panelAnchor && (
        <div
          data-comment-bubble="true"
          className="absolute z-30"
          style={{ left: panelAnchor.x, top: panelAnchor.y }}
        >
          <div className="bg-popover absolute bottom-0 left-0 flex items-center rounded-full p-1 shadow-lg ring-2 ring-blue-500">
            <div className="bg-primary text-primary-foreground flex h-[30px] w-[30px] items-center justify-center rounded-full text-xs font-semibold">
              {userName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </div>
      )}
      {panelAnchor && (pendingPlacement || activeThread) && activePageId && (
        <div ref={commentPanelRef}>
          <CommentThreadPanel
            x={panelAnchor.x}
            y={panelAnchor.y}
            thread={pendingPlacement ? null : activeThread}
            isCreating={!!pendingPlacement}
            onCreate={handleCommentCreate}
            onReply={handleReply}
            onResolveToggle={handleResolveToggle}
            onDelete={handleDeleteComment}
            onClose={() => {
              setPendingPlacement(null);
              useEditorStore.getState().setActiveCommentId(null);
              useEditorStore.getState().setActiveTool('move');
            }}
            currentUserId={userId}
            currentUserName={userName}
          />
        </div>
      )}
      {rulersVisible && (
        <>
          <RulerCorner />
          <Ruler orientation="horizontal" ydoc={ydoc} />
          <Ruler orientation="vertical" ydoc={ydoc} />
        </>
      )}
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <EditorToolbar />
      </div>
    </div>
  );
}
