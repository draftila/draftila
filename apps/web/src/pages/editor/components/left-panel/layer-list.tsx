import { useCallback } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  groupShapes,
  moveShapesInStack,
  ungroupShapes,
  updateShape,
} from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import { LayerRow } from './layer-row';
import { LayerContextMenu } from './layer-context-menu';
import type { LayerRow as LayerRowData } from './types';
import type { DragState } from './types';
import type { ContextMenuState } from './types';

interface LayerListProps {
  ydoc: Y.Doc;
  rows: LayerRowData[];
  shapeById: Map<string, Shape>;
  dragState: DragState | null;
  contextMenu: ContextMenuState | null;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  onToggleExpanded: (id: string) => void;
  onOpenContextMenu: (id: string, e: React.MouseEvent) => void;
  onCloseContextMenu: () => void;
  onDragStart: (id: string, e: React.DragEvent<HTMLButtonElement>) => void;
  onDragOver: (row: LayerRowData, e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (row: LayerRowData, e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}

export function LayerList({
  ydoc,
  rows,
  shapeById,
  dragState,
  contextMenu,
  contextMenuRef,
  onToggleExpanded,
  onOpenContextMenu,
  onCloseContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: LayerListProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        useEditorStore.getState().toggleSelection(id);
      } else {
        setSelectedIds([id]);
      }
    },
    [setSelectedIds],
  );

  const handleToggleVisibility = useCallback(
    (id: string, visible: boolean) => {
      updateShape(ydoc, id, { visible: !visible } as Partial<Shape>);
    },
    [ydoc],
  );

  const handleToggleLock = useCallback(
    (id: string, locked: boolean) => {
      updateShape(ydoc, id, { locked: !locked } as Partial<Shape>);
    },
    [ydoc],
  );

  const activeSelectionIds = (() => {
    if (!contextMenu) return selectedIds;
    if (selectedIds.includes(contextMenu.targetId)) return selectedIds;
    return [contextMenu.targetId];
  })();

  const handleGroup = useCallback(() => {
    const groupId = groupShapes(ydoc, activeSelectionIds);
    if (groupId) setSelectedIds([groupId]);
    onCloseContextMenu();
  }, [activeSelectionIds, setSelectedIds, ydoc, onCloseContextMenu]);

  const handleUngroup = useCallback(() => {
    const childIds = ungroupShapes(ydoc, activeSelectionIds);
    if (childIds.length > 0) setSelectedIds(childIds);
    onCloseContextMenu();
  }, [activeSelectionIds, setSelectedIds, ydoc, onCloseContextMenu]);

  const handleStackMove = useCallback(
    (direction: 'forward' | 'backward' | 'front' | 'back') => {
      const movedIds = moveShapesInStack(ydoc, activeSelectionIds, direction);
      if (movedIds.length > 0) setSelectedIds(movedIds);
      onCloseContextMenu();
    },
    [activeSelectionIds, setSelectedIds, ydoc, onCloseContextMenu],
  );

  return (
    <>
      <div className="flex-1 overflow-auto" onContextMenu={(e) => e.preventDefault()}>
        {rows.map((row) => (
          <LayerRow
            key={row.shape.id}
            row={row}
            isSelected={selectedIds.includes(row.shape.id)}
            dragState={dragState}
            onSelect={handleSelect}
            onContextMenu={onOpenContextMenu}
            onToggleExpanded={onToggleExpanded}
            onToggleVisibility={handleToggleVisibility}
            onToggleLock={handleToggleLock}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>

      {contextMenu && (
        <LayerContextMenu
          ref={contextMenuRef}
          contextMenu={contextMenu}
          selectedIds={selectedIds}
          shapeById={shapeById}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onStackMove={handleStackMove}
        />
      )}
    </>
  );
}
