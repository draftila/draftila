import { useCallback, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, Plus, Settings2 } from 'lucide-react';
import type { ArrowheadType, Stroke, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';
import { NumberInput } from '../number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StrokeWidthIcon, DashPreview } from './stroke-icons';
import {
  CHECKERBOARD,
  DEFAULT_STROKE,
  CAP_OPTIONS,
  JOIN_OPTIONS,
  ALIGN_OPTIONS,
  DASH_OPTIONS,
  dashPatternLabel,
} from './stroke-constants';
import { EndpointDropdown, StrokeSettingsPopover } from './stroke-detail-popover';

export function StrokeSection({ shape, onUpdate }: PropertySectionProps) {
  const strokes = 'strokes' in shape ? (shape as Shape & { strokes: Stroke[] }).strokes : null;
  const isLine = shape.type === 'line';
  const startArrowhead =
    isLine && 'startArrowhead' in shape ? (shape.startArrowhead as ArrowheadType) : 'none';
  const endArrowhead =
    isLine && 'endArrowhead' in shape ? (shape.endArrowhead as ArrowheadType) : 'none';

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

  const handleEndpointChange = useCallback(
    (endpoint: 'start' | 'end', val: ArrowheadType) => {
      const arrowheadKey = endpoint === 'start' ? 'startArrowhead' : 'endArrowhead';
      onUpdate({ [arrowheadKey]: val } as Partial<Shape>);
    },
    [onUpdate],
  );

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
        <button
          onClick={addStroke}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
        >
          Stroke
        </button>
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
              isLine={isLine}
              onUpdate={(patch) => updateStroke(index, patch)}
              onRemove={() => removeStroke(index)}
            />
          );
        })}
      </div>
      {isLine && strokes.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <EndpointDropdown
            label="Start"
            value={startArrowhead}
            onChange={(val) => handleEndpointChange('start', val)}
          />
          <EndpointDropdown
            label="End"
            value={endArrowhead}
            onChange={(val) => handleEndpointChange('end', val)}
          />
        </div>
      )}
    </section>
  );
}

function StrokeEntry({
  stroke,
  isLine,
  onUpdate,
  onRemove,
}: {
  stroke: Stroke;
  isLine: boolean;
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

          {!isLine && (
            <>
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
            </>
          )}
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        {!isLine && (
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
        )}

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
