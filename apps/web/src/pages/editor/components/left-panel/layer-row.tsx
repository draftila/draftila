import { memo } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { DragState, LayerRow as LayerRowData } from './types';
import { SHAPE_ICONS } from './types';

interface LayerRowProps {
  row: LayerRowData;
  isSelected: boolean;
  dragState: DragState | null;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  onToggleExpanded: (id: string) => void;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  onDragStart: (id: string, e: React.DragEvent<HTMLButtonElement>) => void;
  onDragOver: (row: LayerRowData, e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (row: LayerRowData, e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}

export const LayerRow = memo(function LayerRow({
  row,
  isSelected,
  dragState,
  onSelect,
  onContextMenu,
  onToggleExpanded,
  onToggleVisibility,
  onToggleLock,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: LayerRowProps) {
  const isDropTarget = dragState?.overId === row.shape.id;
  const isDropBefore = isDropTarget && dragState?.placement === 'before';
  const isDropAfter = isDropTarget && dragState?.placement === 'after';
  const isDropInside = isDropTarget && dragState?.placement === 'inside';

  return (
    <button
      className={`group flex h-8 w-full items-center gap-1 px-2 text-left text-xs transition-colors ${
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
      } ${!row.effectiveVisible ? 'opacity-50' : ''} ${
        isDropInside ? 'bg-primary/10' : ''
      } ${isDropBefore ? 'border-primary border-t-2' : ''} ${
        isDropAfter ? 'border-primary border-b-2' : ''
      }`}
      style={{ paddingLeft: 8 + row.depth * 14 }}
      draggable
      onDragStart={(e) => onDragStart(row.shape.id, e)}
      onDragOver={(e) => onDragOver(row, e)}
      onDrop={(e) => onDrop(row, e)}
      onDragEnd={onDragEnd}
      onClick={(e) => onSelect(row.shape.id, e)}
      onContextMenu={(e) => onContextMenu(row.shape.id, e)}
    >
      <span
        className="text-muted-foreground flex h-4 w-4 shrink-0 items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          if (row.hasChildren) onToggleExpanded(row.shape.id);
        }}
      >
        {row.hasChildren ? (
          row.expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )
        ) : null}
      </span>
      <span className="text-muted-foreground shrink-0">{SHAPE_ICONS[row.shape.type]}</span>
      <span className="min-w-0 flex-1 truncate">{row.shape.name}</span>
      <span
        className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock(row.shape.id, row.shape.locked);
        }}
      >
        {row.effectiveLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      </span>
      <span
        className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility(row.shape.id, row.shape.visible);
        }}
      >
        {row.effectiveVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      </span>
    </button>
  );
});
