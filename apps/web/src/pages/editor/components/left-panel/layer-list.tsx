import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  createComponent,
  listComponentInstances,
  listComponents,
  observeComponents,
} from '@draftila/engine';
import {
  applyBooleanOperation,
  canApplyBooleanOperation,
  groupShapes,
  getExpandedShapeIds,
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
  const [instanceShapeIds, setInstanceShapeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const update = () => {
      const ids = new Set<string>();
      for (const item of listComponentInstances(ydoc)) {
        ids.add(item.shapeId);
      }
      setInstanceShapeIds(ids);
    };

    update();
    return observeComponents(ydoc, update);
  }, [ydoc]);

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        useEditorStore.getState().toggleSelection(id);
      } else {
        setSelectedIds([id]);
        useEditorStore.getState().setEnteredGroupId(null);
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

  const rowsWithInstanceFlag = useMemo(
    () => rows.map((row) => ({ row, isComponentInstance: instanceShapeIds.has(row.shape.id) })),
    [rows, instanceShapeIds],
  );

  const canBoolean = useMemo(
    () => canApplyBooleanOperation(ydoc, activeSelectionIds),
    [ydoc, activeSelectionIds],
  );

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

  const handleCreateComponent = useCallback(() => {
    if (activeSelectionIds.length === 0) {
      onCloseContextMenu();
      return;
    }

    const expandedIds = getExpandedShapeIds(ydoc, activeSelectionIds);
    const nextName = `Component ${listComponents(ydoc).length + 1}`;
    createComponent(ydoc, expandedIds, nextName);
    onCloseContextMenu();
  }, [activeSelectionIds, ydoc, onCloseContextMenu]);

  const handleStackMove = useCallback(
    (direction: 'forward' | 'backward' | 'front' | 'back') => {
      const movedIds = moveShapesInStack(ydoc, activeSelectionIds, direction);
      if (movedIds.length > 0) setSelectedIds(movedIds);
      onCloseContextMenu();
    },
    [activeSelectionIds, setSelectedIds, ydoc, onCloseContextMenu],
  );

  const handleBooleanOperation = useCallback(
    (operation: 'union' | 'subtract' | 'intersect' | 'exclude') => {
      if (!canBoolean) {
        onCloseContextMenu();
        return;
      }

      const newId = applyBooleanOperation(ydoc, activeSelectionIds, operation);
      if (newId) {
        setSelectedIds([newId]);
      }
      onCloseContextMenu();
    },
    [canBoolean, ydoc, activeSelectionIds, setSelectedIds, onCloseContextMenu],
  );

  return (
    <>
      <div className="flex-1 overflow-auto" onContextMenu={(e) => e.preventDefault()}>
        {rowsWithInstanceFlag.map(({ row, isComponentInstance }) => (
          <LayerRow
            key={row.shape.id}
            row={row}
            isSelected={selectedIds.includes(row.shape.id)}
            isComponentInstance={isComponentInstance}
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
          onCreateComponent={handleCreateComponent}
          onBooleanOperation={handleBooleanOperation}
          canBoolean={canBoolean}
          onStackMove={handleStackMove}
        />
      )}
    </>
  );
}
