import type { ToolType } from '@draftila/shared';
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Frame,
  Type,
  Pen,
  Minus,
  Hexagon,
  Star,
  MoveRight,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/stores/editor-store';

interface ToolButtonProps {
  tool: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

function ToolButton({ tool, icon, label, shortcut }: ToolButtonProps) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={activeTool === tool}
          onPressedChange={() => setActiveTool(tool)}
          aria-label={label}
          className="h-8 w-8 p-0"
        >
          {icon}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        <span>{label}</span>
        <kbd className="bg-muted/20 rounded px-1.5 py-0.5 font-mono text-[10px]">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar() {
  return (
    <div className="bg-background flex items-center gap-1 rounded-lg border p-1 shadow-sm">
      <ToolButton
        tool="move"
        icon={<MousePointer2 className="h-4 w-4" />}
        label="Move"
        shortcut="V"
      />
      <ToolButton tool="hand" icon={<Hand className="h-4 w-4" />} label="Hand" shortcut="H" />
      <Separator orientation="vertical" className="mx-1 h-full" />
      <ToolButton tool="frame" icon={<Frame className="h-4 w-4" />} label="Frame" shortcut="F" />
      <ToolButton
        tool="rectangle"
        icon={<Square className="h-4 w-4" />}
        label="Rectangle"
        shortcut="R"
      />
      <ToolButton
        tool="ellipse"
        icon={<Circle className="h-4 w-4" />}
        label="Ellipse"
        shortcut="O"
      />
      <ToolButton
        tool="polygon"
        icon={<Hexagon className="h-4 w-4" />}
        label="Polygon"
        shortcut="Y"
      />
      <ToolButton tool="star" icon={<Star className="h-4 w-4" />} label="Star" shortcut="S" />
      <Separator orientation="vertical" className="mx-1 h-full" />
      <ToolButton tool="line" icon={<Minus className="h-4 w-4" />} label="Line" shortcut="L" />
      <ToolButton
        tool="arrow"
        icon={<MoveRight className="h-4 w-4" />}
        label="Arrow"
        shortcut="A"
      />
      <Separator orientation="vertical" className="mx-1 h-full" />
      <ToolButton tool="text" icon={<Type className="h-4 w-4" />} label="Text" shortcut="T" />
      <ToolButton tool="pen" icon={<Pen className="h-4 w-4" />} label="Pen" shortcut="P" />
    </div>
  );
}
