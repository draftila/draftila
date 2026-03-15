import { useCallback, useEffect, useState } from 'react';
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
} from 'lucide-react';
import { getAllShapes, updateShape, observeShapes } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';

interface LeftPanelProps {
  ydoc: Y.Doc;
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

export function LeftPanel({ ydoc }: LeftPanelProps) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const leftPanelOpen = useEditorStore((s) => s.leftPanelOpen);

  useEffect(() => {
    setShapes(getAllShapes(ydoc));
    const unobserve = observeShapes(ydoc, () => {
      setShapes(getAllShapes(ydoc));
    });
    return unobserve;
  }, [ydoc]);

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey) {
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

  if (!leftPanelOpen) return null;

  const reversedShapes = [...shapes].reverse();

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r">
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium">Layers</span>
        <span className="text-muted-foreground ml-auto text-[10px]">{shapes.length}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {reversedShapes.map((shape) => {
          const isSelected = selectedIds.includes(shape.id);
          return (
            <button
              key={shape.id}
              className={`group flex h-8 w-full items-center gap-2 px-3 text-left text-xs transition-colors ${
                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
              } ${!shape.visible ? 'opacity-50' : ''}`}
              onClick={(e) => handleSelect(shape.id, e)}
            >
              <span className="text-muted-foreground shrink-0">{shapeIcons[shape.type]}</span>
              <span className="min-w-0 flex-1 truncate">{shape.name}</span>
              <span
                className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLock(shape.id, shape.locked);
                }}
              >
                {shape.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              </span>
              <span
                className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleVisibility(shape.id, shape.visible);
                }}
              >
                {shape.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
