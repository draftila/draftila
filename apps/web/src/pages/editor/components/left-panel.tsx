import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';
import {
  Square,
  Circle,
  Frame,
  Type,
  Pen,
  Group,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Minus,
  Hexagon,
  Star,
  MoveRight,
  Image,
  ChevronDown,
  ChevronRight,
  PanelLeft,
  LayoutGrid,
  Home,
  File,
} from 'lucide-react';
import {
  getLayerTree,
  groupShapes,
  moveShapesByDrop,
  moveShapesInStack,
  observeShapes,
  ungroupShapes,
  updateShape,
  type LayerDropPlacement,
  type LayerTreeNode,
} from '@draftila/engine/scene-graph';
import { useProject } from '@/api/projects';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/stores/editor-store';

interface LeftPanelProps {
  ydoc: Y.Doc;
  draftName: string;
  projectId: string;
}

interface LayerRow {
  shape: Shape;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  effectiveVisible: boolean;
  effectiveLocked: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  targetId: string;
}

interface DragState {
  draggingIds: string[];
  overId: string | null;
  placement: LayerDropPlacement | null;
}

const shapeIcons: Record<ShapeType, React.ReactNode> = {
  rectangle: <Square className="h-3.5 w-3.5" />,
  ellipse: <Circle className="h-3.5 w-3.5" />,
  frame: <Frame className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  path: <Pen className="h-3.5 w-3.5" />,
  line: <Minus className="h-3.5 w-3.5" />,
  polygon: <Hexagon className="h-3.5 w-3.5" />,
  star: <Star className="h-3.5 w-3.5" />,
  arrow: <MoveRight className="h-3.5 w-3.5" />,
  image: <Image className="h-3.5 w-3.5" />,
  group: <Group className="h-3.5 w-3.5" />,
};

function flattenRows(tree: LayerTreeNode[], collapsedIds: Set<string>): LayerRow[] {
  const rows: LayerRow[] = [];

  const walk = (
    nodes: LayerTreeNode[],
    depth: number,
    parentVisible: boolean,
    parentLocked: boolean,
  ) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!node) continue;
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && !collapsedIds.has(node.shape.id);
      const effectiveVisible = parentVisible && node.shape.visible;
      const effectiveLocked = parentLocked || node.shape.locked;

      rows.push({
        shape: node.shape,
        depth,
        hasChildren,
        expanded,
        effectiveVisible,
        effectiveLocked,
      });

      if (hasChildren && expanded) {
        walk(node.children, depth + 1, effectiveVisible, effectiveLocked);
      }
    }
  };

  walk(tree, 0, true, false);
  return rows;
}

export function LeftPanel({ ydoc, draftName, projectId }: LeftPanelProps) {
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const leftPanelOpen = useEditorStore((s) => s.leftPanelOpen);
  const setLeftPanelOpen = useEditorStore((s) => s.setLeftPanelOpen);
  const navigate = useNavigate();
  const { data: project } = useProject(projectId);

  useEffect(() => {
    setLayerTree(getLayerTree(ydoc));
    const unobserve = observeShapes(ydoc, () => {
      setLayerTree(getLayerTree(ydoc));
    });
    return unobserve;
  }, [ydoc]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) {
        return;
      }
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    const handleWindowContextMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) {
        return;
      }
      setContextMenu(null);
    };

    const handleScroll = () => {
      setContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleWindowContextMenu);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleWindowContextMenu);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  const shapeById = useMemo(() => {
    const map = new Map<string, Shape>();
    const walk = (nodes: LayerTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.shape.id, node.shape);
        if (node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(layerTree);
    return map;
  }, [layerTree]);

  const rows = useMemo(() => flattenRows(layerTree, collapsedIds), [layerTree, collapsedIds]);

  const activeSelectionIds = useMemo(() => {
    if (!contextMenu) return selectedIds;
    if (selectedIds.includes(contextMenu.targetId)) return selectedIds;
    return [contextMenu.targetId];
  }, [contextMenu, selectedIds]);

  const canGroup = activeSelectionIds.length > 1;
  const canUngroup = activeSelectionIds.some((id) => shapeById.get(id)?.type === 'group');

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

  const toggleExpanded = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openContextMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, targetId: id });
    },
    [selectedIds, setSelectedIds],
  );

  const runGroup = useCallback(() => {
    const groupId = groupShapes(ydoc, activeSelectionIds);
    if (groupId) {
      setSelectedIds([groupId]);
    }
    setContextMenu(null);
  }, [activeSelectionIds, setSelectedIds, ydoc]);

  const runUngroup = useCallback(() => {
    const childIds = ungroupShapes(ydoc, activeSelectionIds);
    if (childIds.length > 0) {
      setSelectedIds(childIds);
    }
    setContextMenu(null);
  }, [activeSelectionIds, setSelectedIds, ydoc]);

  const runStackMove = useCallback(
    (direction: 'forward' | 'backward' | 'front' | 'back') => {
      const movedIds = moveShapesInStack(ydoc, activeSelectionIds, direction);
      if (movedIds.length > 0) {
        setSelectedIds(movedIds);
      }
      setContextMenu(null);
    },
    [activeSelectionIds, setSelectedIds, ydoc],
  );

  const handleDragStart = useCallback(
    (id: string, e: React.DragEvent<HTMLButtonElement>) => {
      const draggingIds = selectedIds.includes(id) ? selectedIds : [id];
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setContextMenu(null);
      setDragState({ draggingIds, overId: null, placement: null });
    },
    [selectedIds, setSelectedIds],
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
        if (prev.overId === row.shape.id && prev.placement === placement) {
          return prev;
        }
        return { ...prev, overId: row.shape.id, placement };
      });
    },
    [dragState],
  );

  const handleDrop = useCallback(
    (row: LayerRow, e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!dragState || !dragState.placement) return;

      const movedIds = moveShapesByDrop(
        ydoc,
        dragState.draggingIds,
        row.shape.id,
        dragState.placement,
      );
      if (movedIds.length > 0) {
        setSelectedIds(movedIds);
        if (dragState.placement === 'inside') {
          setCollapsedIds((prev) => {
            const next = new Set(prev);
            next.delete(row.shape.id);
            return next;
          });
        }
      }

      setDragState(null);
    },
    [dragState, setSelectedIds, ydoc],
  );

  const clearDragState = useCallback(() => {
    setDragState(null);
  }, []);

  const panelHeader = (
    <div className="flex h-12 items-center gap-1.5 border-b px-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => navigate('/')}>
            <File className="mr-2 h-4 w-4" />
            Drafts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{draftName}</p>
        {project && (
          <p className="text-muted-foreground truncate text-[10px] leading-tight">{project.name}</p>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {leftPanelOpen ? 'Collapse panel' : 'Expand panel'}
        </TooltipContent>
      </Tooltip>
    </div>
  );

  if (!leftPanelOpen) {
    return (
      <div className="absolute left-3 top-3 z-10">
        <div className="bg-background flex items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => navigate('/')}>
                <Home className="mr-2 h-4 w-4" />
                Back to Dashboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="truncate text-sm font-medium">{draftName}</span>
          {project && <span className="text-muted-foreground text-[10px]">{project.name}</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setLeftPanelOpen(true)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand panel</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-60 shrink-0 flex-col border-r">
      {panelHeader}
      <div className="flex h-8 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium">Layers</span>
        <span className="text-muted-foreground ml-auto text-[10px]">{shapeById.size}</span>
      </div>
      <div className="flex-1 overflow-auto" onContextMenu={(e) => e.preventDefault()}>
        {rows.map((row) => {
          const isSelected = selectedIds.includes(row.shape.id);
          const isDropTarget = dragState?.overId === row.shape.id;
          const isDropBefore = isDropTarget && dragState?.placement === 'before';
          const isDropAfter = isDropTarget && dragState?.placement === 'after';
          const isDropInside = isDropTarget && dragState?.placement === 'inside';

          return (
            <button
              key={row.shape.id}
              className={`group flex h-8 w-full items-center gap-1 px-2 text-left text-xs transition-colors ${
                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
              } ${!row.effectiveVisible ? 'opacity-50' : ''} ${
                isDropInside ? 'bg-primary/10' : ''
              } ${isDropBefore ? 'border-primary border-t-2' : ''} ${
                isDropAfter ? 'border-primary border-b-2' : ''
              }`}
              style={{ paddingLeft: 8 + row.depth * 14 }}
              draggable
              onDragStart={(e) => handleDragStart(row.shape.id, e)}
              onDragOver={(e) => handleDragOver(row, e)}
              onDrop={(e) => handleDrop(row, e)}
              onDragEnd={clearDragState}
              onClick={(e) => handleSelect(row.shape.id, e)}
              onContextMenu={(e) => openContextMenu(row.shape.id, e)}
            >
              <span
                className="text-muted-foreground flex h-4 w-4 shrink-0 items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.hasChildren) {
                    toggleExpanded(row.shape.id);
                  }
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
              <span className="text-muted-foreground shrink-0">{shapeIcons[row.shape.type]}</span>
              <span className="min-w-0 flex-1 truncate">{row.shape.name}</span>
              <span
                className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLock(row.shape.id, row.shape.locked);
                }}
              >
                {row.effectiveLocked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Unlock className="h-3 w-3" />
                )}
              </span>
              <span
                className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleVisibility(row.shape.id, row.shape.visible);
                }}
              >
                {row.effectiveVisible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="bg-popover text-popover-foreground fixed z-50 min-w-44 rounded-md border p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
            onClick={runGroup}
            disabled={!canGroup}
          >
            Group Selection
          </button>
          <button
            className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
            onClick={runUngroup}
            disabled={!canUngroup}
          >
            Ungroup
          </button>
          <div className="bg-border my-1 h-px" />
          <button
            className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
            onClick={() => runStackMove('front')}
          >
            Bring to Front
          </button>
          <button
            className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
            onClick={() => runStackMove('forward')}
          >
            Bring Forward
          </button>
          <button
            className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
            onClick={() => runStackMove('backward')}
          >
            Send Backward
          </button>
          <button
            className="hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded px-2 text-xs"
            onClick={() => runStackMove('back')}
          >
            Send to Back
          </button>
        </div>
      )}
    </div>
  );
}
