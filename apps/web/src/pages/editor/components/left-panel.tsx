import type * as Y from 'yjs';
import { useProject } from '@/api/projects';
import { useEditorStore } from '@/stores/editor-store';
import { PanelHeader } from './left-panel/panel-header';
import { CollapsedHeader } from './left-panel/collapsed-header';
import { LayerList } from './left-panel/layer-list';
import { useLayerTree } from './left-panel/hooks/use-layer-tree';
import { useContextMenu } from './left-panel/hooks/use-context-menu';
import { useLayerDragDrop } from './left-panel/hooks/use-layer-drag-drop';

interface LeftPanelProps {
  ydoc: Y.Doc;
  draftName: string;
  projectId: string;
}

export function LeftPanel({ ydoc, draftName, projectId }: LeftPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const leftPanelOpen = useEditorStore((s) => s.leftPanelOpen);
  const setLeftPanelOpen = useEditorStore((s) => s.setLeftPanelOpen);
  const { data: project } = useProject(projectId);

  const { rows, shapeById, toggleExpanded, expandNode } = useLayerTree(ydoc);
  const { contextMenu, contextMenuRef, openContextMenu, closeContextMenu } = useContextMenu(
    selectedIds,
    setSelectedIds,
  );
  const { dragState, handleDragStart, handleDragOver, handleDrop, clearDragState } =
    useLayerDragDrop(ydoc, selectedIds, setSelectedIds, expandNode, closeContextMenu);

  if (!leftPanelOpen) {
    return (
      <CollapsedHeader
        draftName={draftName}
        projectName={project?.name}
        onExpand={() => setLeftPanelOpen(true)}
      />
    );
  }

  return (
    <div className="relative flex h-full w-60 shrink-0 flex-col border-r">
      <PanelHeader
        draftName={draftName}
        projectName={project?.name}
        leftPanelOpen={leftPanelOpen}
        onTogglePanel={() => setLeftPanelOpen(!leftPanelOpen)}
      />
      <div className="flex h-8 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium">Layers</span>
        <span className="text-muted-foreground ml-auto text-[10px]">{shapeById.size}</span>
      </div>
      <LayerList
        ydoc={ydoc}
        rows={rows}
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
