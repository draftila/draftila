import { forwardRef, useMemo } from 'react';
import type { Shape } from '@draftila/shared';
import type { ContextMenuState } from './types';

interface LayerContextMenuProps {
  contextMenu: ContextMenuState;
  selectedIds: string[];
  shapeById: Map<string, Shape>;
  onGroup: () => void;
  onUngroup: () => void;
  onCreateComponent: () => void;
  onBooleanOperation: (operation: 'union' | 'subtract' | 'intersect' | 'exclude') => void;
  canBoolean: boolean;
  onStackMove: (direction: 'forward' | 'backward' | 'front' | 'back') => void;
}

export const LayerContextMenu = forwardRef<HTMLDivElement, LayerContextMenuProps>(
  function LayerContextMenu(
    {
      contextMenu,
      selectedIds,
      shapeById,
      onGroup,
      onUngroup,
      onCreateComponent,
      onBooleanOperation,
      canBoolean,
      onStackMove,
    },
    ref,
  ) {
    const activeSelectionIds = useMemo(() => {
      if (selectedIds.includes(contextMenu.targetId)) return selectedIds;
      return [contextMenu.targetId];
    }, [contextMenu.targetId, selectedIds]);

    const canGroup = activeSelectionIds.length > 1;
    const canUngroup = activeSelectionIds.some((id) => shapeById.get(id)?.type === 'group');

    return (
      <div
        ref={ref}
        className="bg-popover text-popover-foreground fixed z-50 min-w-44 rounded-md border p-1 shadow-md"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={onGroup}
          disabled={!canGroup}
        >
          Group Selection
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={onUngroup}
          disabled={!canUngroup}
        >
          Ungroup
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={onCreateComponent}
          disabled={activeSelectionIds.length === 0}
        >
          Create Component
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onBooleanOperation('union')}
          disabled={!canBoolean}
        >
          Union Selection
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onBooleanOperation('subtract')}
          disabled={!canBoolean}
        >
          Subtract Selection
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onBooleanOperation('intersect')}
          disabled={!canBoolean}
        >
          Intersect Selection
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onBooleanOperation('exclude')}
          disabled={!canBoolean}
        >
          Exclude Selection
        </button>
        <div className="bg-border my-1 h-px" />
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
          onClick={() => onStackMove('front')}
        >
          Bring to Front
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
          onClick={() => onStackMove('forward')}
        >
          Bring Forward
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
          onClick={() => onStackMove('backward')}
        >
          Send Backward
        </button>
        <button
          className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
          onClick={() => onStackMove('back')}
        >
          Send to Back
        </button>
      </div>
    );
  },
);
