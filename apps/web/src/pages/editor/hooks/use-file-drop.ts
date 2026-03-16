import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { useEditorStore } from '@/stores/editor-store';
import { screenToCanvas } from '@draftila/engine/camera';
import { addShape, getSelectedContainer } from '@draftila/engine/scene-graph';
import {
  initializeDefaultAdapters,
  importSvgFile,
  interchangeToShapeData,
} from '@draftila/engine/interchange';
import { handleFileDrop as handleImageDrop } from '@draftila/engine/image-manager';

interface UseFileDropOptions {
  ydoc: Y.Doc;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useFileDrop({ ydoc, canvasRef }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      initializeDefaultAdapters();

      const svgFiles: File[] = [];
      const imageFiles: File[] = [];

      for (const file of files) {
        if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
          svgFiles.push(file);
        } else if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      const state = useEditorStore.getState();
      const targetParentId = getSelectedContainer(ydoc, state.selectedIds);
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const dropPoint = canvasRect
        ? screenToCanvas(e.clientX - canvasRect.left, e.clientY - canvasRect.top, state.camera)
        : state.cursorCanvasPoint;
      const newIds: string[] = [];
      const dropX = dropPoint?.x ?? 100;
      const dropY = dropPoint?.y ?? 100;

      for (const svgFile of svgFiles) {
        const doc = await importSvgFile(svgFile);
        const shapeData = interchangeToShapeData(doc);
        const indexToId = new Map<number, string>();

        for (let i = 0; i < shapeData.length; i++) {
          const item = shapeData[i]!;
          const parentId =
            item.parentIndex !== null
              ? (indexToId.get(item.parentIndex) ?? targetParentId)
              : targetParentId;

          const id = addShape(ydoc, item.type, {
            ...item.props,
            x: ((item.props['x'] as number) ?? 0) + dropX,
            y: ((item.props['y'] as number) ?? 0) + dropY,
            parentId,
          });
          indexToId.set(i, id);

          if (item.parentIndex === null) {
            newIds.push(id);
          }
        }
      }

      if (imageFiles.length > 0) {
        const fileList = new DataTransfer();
        for (const f of imageFiles) fileList.items.add(f);
        const imageIds = await handleImageDrop(ydoc, fileList.files, dropX, dropY, targetParentId);
        newIds.push(...imageIds);
      }

      if (newIds.length > 0) {
        useEditorStore.getState().setSelectedIds(newIds);
      }
    },
    [ydoc, canvasRef],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const { camera } = useEditorStore.getState();
      const point = screenToCanvas(e.clientX - canvasRect.left, e.clientY - canvasRect.top, camera);
      useEditorStore.getState().setCursorCanvasPoint(point);
    },
    [canvasRef],
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    parent.addEventListener('drop', handleDrop);
    parent.addEventListener('dragover', handleDragOver);
    parent.addEventListener('dragleave', handleDragLeave);
    parent.addEventListener('dragenter', handleDragEnter);

    return () => {
      parent.removeEventListener('drop', handleDrop);
      parent.removeEventListener('dragover', handleDragOver);
      parent.removeEventListener('dragleave', handleDragLeave);
      parent.removeEventListener('dragenter', handleDragEnter);
    };
  }, [canvasRef, handleDrop, handleDragOver, handleDragLeave, handleDragEnter]);

  return { isDragging };
}
