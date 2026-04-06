import { useState, useRef, useEffect } from 'react';
import type { ToolType } from '@draftila/shared';
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Frame,
  Type,
  PenTool,
  Pencil,
  Minus,
  Hexagon,
  Star,
  MoveRight,
  MessageCircle,
  ChevronDown,
  Code2,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/stores/editor-store';

interface ToolOption {
  tool: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

type ToolButtonProps = ToolOption;

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

function ToolGroup({ options }: { options: ToolOption[] }) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const [open, setOpen] = useState(false);
  const [lastUsedTool, setLastUsedTool] = useState<ToolType>(options[0]!.tool);
  const containerRef = useRef<HTMLDivElement>(null);

  const isGroupActive = options.some((o) => o.tool === activeTool);

  useEffect(() => {
    if (isGroupActive) {
      setLastUsedTool(activeTool);
    }
  }, [activeTool, isGroupActive]);

  const displayOption =
    options.find((o) => o.tool === (isGroupActive ? activeTool : lastUsedTool)) ?? options[0]!;

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={isGroupActive}
              onPressedChange={() => setActiveTool(displayOption.tool)}
              aria-label={displayOption.label}
              className="h-8 w-8 rounded-r-none p-0"
            >
              {displayOption.icon}
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="top" className="flex items-center gap-2">
            <span>{displayOption.label}</span>
            <kbd className="bg-muted/20 rounded px-1.5 py-0.5 font-mono text-[10px]">
              {displayOption.shortcut}
            </kbd>
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          className={`hover:bg-muted flex h-8 w-4 items-center justify-center rounded-r-md transition-colors ${isGroupActive ? 'bg-accent text-accent-foreground' : ''}`}
          onClick={() => setOpen(!open)}
          aria-label="More tools"
        >
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </div>

      {open && (
        <div className="bg-popover text-popover-foreground absolute bottom-full left-0 z-50 mb-1 min-w-40 rounded-md border p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.tool}
              type="button"
              className={`flex h-8 w-full items-center gap-3 rounded px-2 text-xs transition-colors ${
                activeTool === option.tool ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              }`}
              onClick={() => {
                setActiveTool(option.tool);
                setOpen(false);
              }}
            >
              <span className="shrink-0">{option.icon}</span>
              <span className="flex-1 text-left">{option.label}</span>
              <kbd className="text-muted-foreground font-mono text-[10px]">{option.shortcut}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SHAPE_TOOLS: ToolOption[] = [
  { tool: 'rectangle', icon: <Square className="h-4 w-4" />, label: 'Rectangle', shortcut: 'R' },
  { tool: 'ellipse', icon: <Circle className="h-4 w-4" />, label: 'Ellipse', shortcut: 'O' },
  { tool: 'polygon', icon: <Hexagon className="h-4 w-4" />, label: 'Polygon', shortcut: 'Y' },
  { tool: 'star', icon: <Star className="h-4 w-4" />, label: 'Star', shortcut: 'S' },
  { tool: 'line', icon: <Minus className="h-4 w-4" />, label: 'Line', shortcut: 'L' },
  { tool: 'arrow', icon: <MoveRight className="h-4 w-4" />, label: 'Arrow', shortcut: 'A' },
];

const PEN_TOOLS: ToolOption[] = [
  { tool: 'pen', icon: <PenTool className="h-4 w-4" />, label: 'Pen', shortcut: 'P' },
  {
    tool: 'pencil',
    icon: <Pencil className="h-4 w-4" />,
    label: 'Pencil',
    shortcut: '\u21E7P',
  },
];

function DevModeToggle() {
  const devMode = useEditorStore((s) => s.devMode);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={devMode}
          onPressedChange={() => {
            const store = useEditorStore.getState();
            store.setDevMode(!store.devMode);
            store.setRightPanelOpen(true);
          }}
          aria-label="Dev Mode"
          className="h-8 w-8 p-0"
        >
          <Code2 className="h-4 w-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        <span>Dev Mode</span>
        <kbd className="bg-muted/20 rounded px-1.5 py-0.5 font-mono text-[10px]">⇧D</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar() {
  const devMode = useEditorStore((s) => s.devMode);

  if (devMode) {
    return (
      <div className="bg-background flex items-center gap-1 rounded-lg border p-1 shadow-sm">
        <ToolButton
          tool="move"
          icon={<MousePointer2 className="h-4 w-4" />}
          label="Move"
          shortcut="V"
        />
        <ToolButton
          tool="comment"
          icon={<MessageCircle className="h-4 w-4" />}
          label="Comment"
          shortcut="C"
        />
        <Separator orientation="vertical" className="mx-1 h-full" />
        <DevModeToggle />
      </div>
    );
  }

  return (
    <div className="bg-background flex items-center gap-1 rounded-lg border p-1 shadow-sm">
      <ToolButton
        tool="move"
        icon={<MousePointer2 className="h-4 w-4" />}
        label="Move"
        shortcut="V"
      />
      <ToolButton tool="hand" icon={<Hand className="h-4 w-4" />} label="Hand" shortcut="H" />
      <ToolButton
        tool="comment"
        icon={<MessageCircle className="h-4 w-4" />}
        label="Comment"
        shortcut="C"
      />
      <Separator orientation="vertical" className="mx-1 h-full" />
      <ToolButton tool="frame" icon={<Frame className="h-4 w-4" />} label="Frame" shortcut="F" />
      <ToolGroup options={SHAPE_TOOLS} />
      <Separator orientation="vertical" className="mx-1 h-full" />
      <ToolButton tool="text" icon={<Type className="h-4 w-4" />} label="Text" shortcut="T" />
      <ToolGroup options={PEN_TOOLS} />
      <Separator orientation="vertical" className="mx-1 h-full" />
      <DevModeToggle />
    </div>
  );
}
