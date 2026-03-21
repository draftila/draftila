import { useState } from 'react';
import type * as Y from 'yjs';
import { Search, X } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { LayerList } from './left-panel/layer-list';
import { PageList } from './left-panel/page-list';
import { ComponentsList } from './left-panel/components-list';
import { useLayerTree } from './left-panel/hooks/use-layer-tree';
import { useContextMenu } from './left-panel/hooks/use-context-menu';
import { useLayerDragDrop } from './left-panel/hooks/use-layer-drag-drop';

interface LeftPanelProps {
  ydoc: Y.Doc;
}

export function LeftPanel({ ydoc }: LeftPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const leftPanelOpen = useEditorStore((s) => s.leftPanelOpen);

  const [layerSearch, setLayerSearch] = useState('');
  const { rows, shapeById, toggleExpanded, expandNode } = useLayerTree(ydoc);

  const filteredRows = layerSearch.trim()
    ? rows.filter((row) => row.shape.name.toLowerCase().includes(layerSearch.trim().toLowerCase()))
    : rows;
  const { contextMenu, contextMenuRef, openContextMenu, closeContextMenu } = useContextMenu(
    selectedIds,
    setSelectedIds,
  );
  const { dragState, handleDragStart, handleDragOver, handleDrop, clearDragState } =
    useLayerDragDrop(ydoc, selectedIds, setSelectedIds, expandNode, closeContextMenu);

  if (!leftPanelOpen) {
    return null;
  }

  return (
    <div className="relative flex h-full w-60 shrink-0 flex-col border-r">
      <PageList ydoc={ydoc} />
      <ComponentsList ydoc={ydoc} />
      <div className="flex h-8 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium">Layers</span>
        <span className="text-muted-foreground ml-auto text-[10px]">{shapeById.size}</span>
      </div>
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <Search className="text-muted-foreground h-3 w-3 shrink-0" />
        <input
          value={layerSearch}
          onChange={(e) => setLayerSearch(e.target.value)}
          placeholder="Filter layers..."
          className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
        />
        {layerSearch && (
          <button onClick={() => setLayerSearch('')} className="text-muted-foreground shrink-0">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <LayerList
        ydoc={ydoc}
        rows={filteredRows}
        shapeById={shapeById}
        dragState={dragState}
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        onToggleExpanded={toggleExpanded}
        onOpenContextMenu={openContextMenu}
        onCloseContextMenu={closeContextMenu}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={clearDragState}
      />
    </div>
  );
}
