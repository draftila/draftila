import { useCallback, useState } from 'react';
import type * as Y from 'yjs';
import type { LayerDropPlacement } from '@draftila/engine/scene-graph';
import { opMoveByDrop } from '@draftila/engine/operations';
import type { DragState, LayerRow } from '../types';

export function useLayerDragDrop(
  ydoc: Y.Doc,
  selectedIds: string[],
  setSelectedIds: (ids: string[]) => void,
  expandNode: (id: string) => void,
  closeContextMenu: () => void,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);

  const handleDragStart = useCallback(
    (id: string, e: React.DragEvent<HTMLButtonElement>) => {
      const draggingIds = selectedIds.includes(id) ? selectedIds : [id];
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      closeContextMenu();
      setDragState({ draggingIds, overId: null, placement: null });
    },
    [selectedIds, setSelectedIds, closeContextMenu],
  );

  const handleDragOver = useCallback(
    (row: LayerRow, e: React.DragEvent<HTMLButtonElement>) => {
      if (!dragState) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      const canDropInside = row.shape.type === 'group' || row.shape.type === 'frame';

      const placement: LayerDropPlacement =
        canDropInside && ratio > 0.3 && ratio < 0.7 ? 'inside' : ratio < 0.5 ? 'before' : 'after';

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      setDragState((prev) => {
        if (!prev) return prev;
        if (prev.overId === row.shape.id && prev.placement === placement) return prev;
        return { ...prev, overId: row.shape.id, placement };
      });
    },
    [dragState],
  );

  const handleDrop = useCallback(
    (row: LayerRow, e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!dragState || !dragState.placement) return;

      const movedIds = opMoveByDrop(ydoc, dragState.draggingIds, row.shape.id, dragState.placement);
      if (movedIds.length > 0) {
        setSelectedIds(movedIds);
        if (dragState.placement === 'inside') {
          expandNode(row.shape.id);
        }
      }

      setDragState(null);
    },
    [dragState, setSelectedIds, ydoc, expandNode],
  );

  const clearDragState = useCallback(() => {
    setDragState(null);
  }, []);

  return { dragState, handleDragStart, handleDragOver, handleDrop, clearDragState };
}
