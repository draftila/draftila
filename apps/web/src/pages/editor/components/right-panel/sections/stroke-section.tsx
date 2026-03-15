import { useCallback, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, Plus, Settings2, X } from 'lucide-react';
import type {
  Stroke,
  StrokeAlign,
  StrokeCap,
  StrokeDashPattern,
  StrokeJoin,
  Shape,
} from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';
import { NumberInput } from '../number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

const DEFAULT_STROKE: Stroke = {
  color: '#000000',
  width: 1,
  opacity: 1,
  visible: true,
  cap: 'butt',
  join: 'miter',
  align: 'center',
  dashPattern: 'solid',
  dashOffset: 0,
  miterLimit: 4,
};

function StrokeWidthIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" />
      <line x1="1" y1="11.5" x2="13" y2="11.5" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function CapButtIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1="4"
        y1="8"
        x2="14"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="butt"
      />
    </svg>
  );
}

function CapRoundIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1="4"
        y1="8"
        x2="14"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CapSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1="4"
        y1="8"
        x2="13"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}

function JoinMiterIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13L3 3L13 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  );
}

function JoinRoundIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13L3 6C3 4.34315 4.34315 3 6 3L13 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function JoinBevelIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13L3 6L6 3L13 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="bevel"
        fill="none"
      />
    </svg>
  );
}

function AlignCenterIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function AlignInsideIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function AlignOutsideIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.5"
        y="3.5"
        width="9"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function DashPreview({ pattern, className }: { pattern: StrokeDashPattern; className?: string }) {
  const dashArrayMap: Record<StrokeDashPattern, string> = {
    solid: '',
    dash: '6 3',
    dot: '2 3',
    'dash-dot': '6 3 2 3',
  };
  return (
    <svg
      width="48"
      height="8"
      viewBox="0 0 48 8"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line
        x1="0"
        y1="4"
        x2="48"
        y2="4"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dashArrayMap[pattern]}
        strokeLinecap="round"
      />
    </svg>
  );
}

const CAP_OPTIONS: Array<{ value: StrokeCap; label: string; Icon: typeof CapButtIcon }> = [
  { value: 'butt', label: 'None', Icon: CapButtIcon },
  { value: 'round', label: 'Round', Icon: CapRoundIcon },
  { value: 'square', label: 'Square', Icon: CapSquareIcon },
];

const JOIN_OPTIONS: Array<{ value: StrokeJoin; label: string; Icon: typeof JoinMiterIcon }> = [
  { value: 'miter', label: 'Miter', Icon: JoinMiterIcon },
  { value: 'round', label: 'Round', Icon: JoinRoundIcon },
  { value: 'bevel', label: 'Bevel', Icon: JoinBevelIcon },
];

const ALIGN_OPTIONS: Array<{
  value: StrokeAlign;
  label: string;
  Icon: typeof AlignCenterIcon;
}> = [
  { value: 'center', label: 'Center', Icon: AlignCenterIcon },
  { value: 'inside', label: 'Inside', Icon: AlignInsideIcon },
  { value: 'outside', label: 'Outside', Icon: AlignOutsideIcon },
];

const DASH_OPTIONS: StrokeDashPattern[] = ['solid', 'dash', 'dot', 'dash-dot'];

function dashPatternLabel(pattern: StrokeDashPattern) {
  const labels: Record<StrokeDashPattern, string> = {
    solid: 'Solid',
    dash: 'Dashed',
    dot: 'Dotted',
    'dash-dot': 'Dash Dot',
  };
  return labels[pattern];
}

export function StrokeSection({ shape, onUpdate }: PropertySectionProps) {
  const strokes = 'strokes' in shape ? (shape as Shape & { strokes: Stroke[] }).strokes : null;

  const updateStroke = useCallback(
    (index: number, patch: Partial<Stroke>) => {
      if (!strokes) return;
      const next = strokes.map((s, i) => (i === index ? { ...s, ...patch } : s));
      onUpdate({ strokes: next } as Partial<Shape>);
    },
    [strokes, onUpdate],
  );

  const removeStroke = useCallback(
    (index: number) => {
      if (!strokes) return;
      const next = strokes.filter((_, i) => i !== index);
      onUpdate({ strokes: next } as Partial<Shape>);
    },
    [strokes, onUpdate],
  );

  const addStroke = useCallback(() => {
    if (!strokes) return;
    onUpdate({ strokes: [...strokes, { ...DEFAULT_STROKE }] } as Partial<Shape>);
  }, [strokes, onUpdate]);

  if (!strokes) return null;

  return (
    <section>
      <div
        className={
          strokes.length > 0
            ? 'mb-2 flex items-center justify-between'
            : 'flex items-center justify-between'
        }
      >
        <h4 className="text-muted-foreground text-[11px] font-medium">Stroke</h4>
        <div className="flex items-center gap-0.5">
          <button
            onClick={addStroke}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {[...strokes].reverse().map((stroke, reverseIndex) => {
          const index = strokes.length - 1 - reverseIndex;
          return (
            <StrokeEntry
              key={index}
              stroke={stroke}
              onUpdate={(patch) => updateStroke(index, patch)}
              onRemove={() => removeStroke(index)}
            />
          );
        })}
      </div>
    </section>
  );
}

function StrokeEntry({
  stroke,
  onUpdate,
  onRemove,
}: {
  stroke: Stroke;
  onUpdate: (patch: Partial<Stroke>) => void;
  onRemove: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);

  const opacityPercent = Math.round(stroke.opacity * 100);
  const visible = stroke.visible !== false;
  const cap = stroke.cap ?? 'butt';
  const join = stroke.join ?? 'miter';
  const align = stroke.align ?? 'center';
  const dashPattern = stroke.dashPattern ?? 'solid';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ColorPicker
          color={stroke.color}
          opacity={stroke.opacity}
          onChange={(color) => onUpdate({ color })}
          onOpacityChange={(opacity) => onUpdate({ opacity })}
        >
          <button
            className={`hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2.5 rounded py-0.5 ${!visible ? 'opacity-50' : ''}`}
          >
            <div className="border-border relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded border">
              <div className="absolute inset-0" style={{ background: CHECKERBOARD }} />
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: stroke.color,
                  opacity: stroke.opacity,
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: stroke.color,
                  clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
                }}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
              <span className="truncate font-mono text-[11px] leading-snug">
                {stroke.color.replace('#', '').toUpperCase()}
              </span>
              <span className="text-muted-foreground truncate text-[10px] leading-snug">
                {opacityPercent}% &middot; Solid
              </span>
            </div>
          </button>
        </ColorPicker>

        <button
          onClick={() => onUpdate({ visible: !visible })}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="w-20 shrink-0">
          <NumberInput
            label=""
            icon={<StrokeWidthIcon className="h-3.5 w-3.5" />}
            value={stroke.width}
            onChange={(width) => onUpdate({ width })}
            min={0}
            step={1}
          />
        </div>
        <input
          type="range"
          min={0}
          max={32}
          value={stroke.width}
          onChange={(e) => onUpdate({ width: parseInt(e.target.value, 10) })}
          className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
        />
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <div className="flex items-center">
            {CAP_OPTIONS.map(({ value, label, Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onUpdate({ cap: value })}
                    className={`rounded p-1 transition-colors ${
                      cap === value
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label} cap</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div className="bg-border mx-0.5 h-3.5 w-px shrink-0" />

          <div className="flex items-center">
            {JOIN_OPTIONS.map(({ value, label, Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onUpdate({ join: value })}
                    className={`rounded p-1 transition-colors ${
                      join === value
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label} join</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    className={`ml-auto shrink-0 rounded p-1 transition-colors ${
                      settingsOpen
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent>Stroke settings</TooltipContent>
            </Tooltip>
            <StrokeSettingsPopover
              stroke={stroke}
              onUpdate={onUpdate}
              onClose={() => setSettingsOpen(false)}
            />
          </Popover>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <div className="flex items-center">
            {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onUpdate({ align: value })}
                    className={`rounded p-1 transition-colors ${
                      align === value
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        <Popover open={dashOpen} onOpenChange={setDashOpen}>
          <PopoverTrigger asChild>
            <button className="border-input flex h-6 min-w-0 flex-1 items-center justify-between gap-1.5 rounded-md border px-1.5">
              <DashPreview pattern={dashPattern} className="text-foreground" />
              <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-40 p-1">
            {DASH_OPTIONS.map((pattern) => (
              <button
                key={pattern}
                onClick={() => {
                  onUpdate({ dashPattern: pattern });
                  setDashOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors ${
                  dashPattern === pattern ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
              >
                <DashPreview
                  pattern={pattern}
                  className={dashPattern === pattern ? 'text-accent-foreground' : 'text-foreground'}
                />
                <span>{dashPatternLabel(pattern)}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function StrokeSettingsPopover({
  stroke,
  onUpdate,
  onClose,
}: {
  stroke: Stroke;
  onUpdate: (patch: Partial<Stroke>) => void;
  onClose: () => void;
}) {
  const dashOffset = stroke.dashOffset ?? 0;
  const miterLimit = stroke.miterLimit ?? 4;
  const join = stroke.join ?? 'miter';

  return (
    <PopoverContent side="left" align="start" className="w-64">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Stroke settings</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {join === 'miter' && (
        <div className="mt-3 space-y-2">
          <span className="text-muted-foreground text-[11px] font-medium">Miter Limit</span>
          <div className="flex items-center gap-2">
            <div className="w-16 shrink-0">
              <NumberInput
                label=""
                value={miterLimit}
                onChange={(v) => onUpdate({ miterLimit: v })}
                min={0}
                step={0.5}
              />
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={miterLimit}
              onChange={(e) => onUpdate({ miterLimit: parseFloat(e.target.value) })}
              className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
            />
          </div>
        </div>
      )}

      {stroke.dashPattern !== 'solid' && (
        <div className="mt-3 space-y-2">
          <span className="text-muted-foreground text-[11px] font-medium">Dash Offset</span>
          <div className="flex items-center gap-2">
            <div className="w-16 shrink-0">
              <NumberInput
                label=""
                value={dashOffset}
                onChange={(v) => onUpdate({ dashOffset: v })}
                min={0}
                step={1}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={dashOffset}
              onChange={(e) => onUpdate({ dashOffset: parseInt(e.target.value, 10) })}
              className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
            />
          </div>
        </div>
      )}

      {join !== 'miter' && stroke.dashPattern === 'solid' && (
        <p className="text-muted-foreground mt-3 text-center text-[11px]">
          No additional settings for current configuration
        </p>
      )}
    </PopoverContent>
  );
}
