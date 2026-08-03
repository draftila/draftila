import { useCallback, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Gradient, GradientStop } from '@draftila/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ColorPicker } from './color-picker';
import { useVariables } from '../hooks/use-variables';

const DEFAULT_NEW_STOP_COLOR = '#888888';

interface GradientEditorProps {
  gradient: Gradient;
  onChange: (gradient: Gradient) => void;
  children: React.ReactNode;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Resolves a stop's colour for display; matches the engine's render-time rule. */
type ResolveColor = (color: string | undefined, colorVar: string | undefined) => string | undefined;

const identityResolve: ResolveColor = (color) => color;

function stopColor(stop: GradientStop, resolve: ResolveColor): string {
  return resolve(stop.color, stop.colorVar) ?? stop.color;
}

function gradientToCss(gradient: Gradient, resolve: ResolveColor = identityResolve): string {
  const stopsCss = gradient.stops
    .map((s) => `${stopColor(s, resolve)} ${s.position * 100}%`)
    .join(', ');
  if (gradient.type === 'linear') {
    return `linear-gradient(${gradient.angle ?? 0}deg, ${stopsCss})`;
  }
  return `radial-gradient(circle at ${(gradient.cx ?? 0.5) * 100}% ${(gradient.cy ?? 0.5) * 100}%, ${stopsCss})`;
}

export function gradientPreviewCss(gradient: Gradient, resolve: ResolveColor = identityResolve): string {
  return gradientToCss(gradient, resolve);
}

function GradientStopBar({
  stops,
  onStopChange,
  onStopAdd,
  onStopRemove: _onStopRemove,
  selectedIndex,
  onSelectStop,
  resolve,
}: {
  stops: GradientStop[];
  onStopChange: (index: number, stop: GradientStop) => void;
  onStopAdd: (position: number) => void;
  onStopRemove: (index: number) => void;
  selectedIndex: number;
  onSelectStop: (index: number) => void;
  resolve: ResolveColor;
}) {
  const sorted = [...stops].map((s, i) => ({ ...s, originalIndex: i }));
  sorted.sort((a, b) => a.position - b.position);

  const stopsCss = sorted.map((s) => `${stopColor(s, resolve)} ${s.position * 100}%`).join(', ');
  const barBackground = `linear-gradient(to right, ${stopsCss})`;

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const hitThreshold = 8 / rect.width;
    const hitStop = sorted.find((s) => Math.abs(s.position - x) < hitThreshold);
    if (hitStop) {
      onSelectStop(hitStop.originalIndex);
      return;
    }
    onStopAdd(Math.round(x * 100) / 100);
  };

  const handleStopDrag = (index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectStop(index);
    const bar = (e.currentTarget as HTMLElement).parentElement!;
    const rect = bar.getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      const pos = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      onStopChange(index, { ...stops[index]!, position: Math.round(pos * 100) / 100 });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="relative h-6 w-full cursor-pointer rounded" onClick={handleBarClick}>
      <div className="absolute inset-0 rounded" style={{ background: barBackground }} />
      {stops.map((stop, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab"
          style={{ left: `${stop.position * 100}%` }}
          onPointerDown={(e) => handleStopDrag(i, e)}
        >
          <div
            className={`h-4 w-4 rounded-full border-[2.5px] ${i === selectedIndex ? 'border-white' : 'border-white/60'}`}
            style={{
              backgroundColor: stopColor(stop, resolve),
              boxShadow:
                i === selectedIndex
                  ? '0 0 0 1.5px #0D99FF, 0 1px 3px rgba(0,0,0,0.3)'
                  : '0 0 0 1px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function GradientEditor({ gradient, onChange, children }: GradientEditorProps) {
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  // The gradient stays RAW here. Resolving it up front would be a data-loss bug:
  // `updateStop` rewrites the whole stops array, so editing one stop would bake
  // resolved colours into every other stop's literal.
  const { resolve } = useVariables();

  const selectedStop = gradient.stops[selectedStopIndex] ?? gradient.stops[0];
  const selectedStopColor = selectedStop
    ? stopColor(selectedStop, resolve)
    : DEFAULT_NEW_STOP_COLOR;

  const updateStop = useCallback(
    (index: number, stop: GradientStop) => {
      const nextStops = gradient.stops.map((s, i) => (i === index ? stop : s));
      onChange({ ...gradient, stops: nextStops });
    },
    [gradient, onChange],
  );

  const addStop = useCallback(
    (position: number) => {
      const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
      let color = DEFAULT_NEW_STOP_COLOR;
      if (sorted.length >= 2) {
        let before = sorted[0]!;
        let after = sorted[sorted.length - 1]!;
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i]!.position <= position && sorted[i + 1]!.position >= position) {
            before = sorted[i]!;
            after = sorted[i + 1]!;
            break;
          }
        }
        color = before.position === after.position ? before.color : before.color;
      }
      const nextStops = [...gradient.stops, { color, position }];
      onChange({ ...gradient, stops: nextStops });
      setSelectedStopIndex(nextStops.length - 1);
    },
    [gradient, onChange],
  );

  const removeStop = useCallback(
    (index: number) => {
      if (gradient.stops.length <= 2) return;
      const nextStops = gradient.stops.filter((_, i) => i !== index);
      onChange({ ...gradient, stops: nextStops });
      setSelectedStopIndex(Math.min(selectedStopIndex, nextStops.length - 1));
    },
    [gradient, onChange, selectedStopIndex],
  );

  const handleAngleChange = useCallback(
    (value: string) => {
      const num = parseInt(value, 10);
      if (!isNaN(num) && gradient.type === 'linear') {
        onChange({ ...gradient, angle: num % 360 });
      }
    },
    [gradient, onChange],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[248px] p-3" side="left" align="start">
        <GradientStopBar
          stops={gradient.stops}
          onStopChange={updateStop}
          onStopAdd={addStop}
          onStopRemove={removeStop}
          selectedIndex={selectedStopIndex}
          onSelectStop={setSelectedStopIndex}
          resolve={resolve}
        />

        <div className="mt-2.5 flex items-center gap-1.5">
          {selectedStop && (
            <ColorPicker
              color={selectedStopColor}
              opacity={1}
              colorVar={selectedStop.colorVar}
              // Rest-destructure rather than spreading `selectedStop`: a spread
              // would carry `colorVar` back in and defeat the detach.
              onChange={(color, meta) => {
                const { colorVar: _drop, ...rest } = selectedStop;
                updateStop(
                  selectedStopIndex,
                  meta?.colorVar ? { ...rest, color, colorVar: meta.colorVar } : { ...rest, color },
                );
              }}
              onOpacityChange={() => {}}
            >
              <button
                className="border-border h-7 w-7 shrink-0 rounded border"
                style={{ backgroundColor: selectedStopColor }}
              />
            </ColorPicker>
          )}

          <div className="border-input flex h-7 flex-1 items-center rounded-md border px-2">
            <span className="text-muted-foreground mr-1 text-[10px]">Pos</span>
            <input
              value={selectedStop ? Math.round(selectedStop.position * 100) : 0}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && selectedStop) {
                  updateStop(selectedStopIndex, {
                    ...selectedStop,
                    position: clamp(num / 100, 0, 1),
                  });
                }
              }}
              className="w-full bg-transparent text-right font-mono text-[11px] outline-none"
              maxLength={3}
            />
            <span className="text-muted-foreground ml-0.5 text-[10px]">%</span>
          </div>

          {gradient.stops.length > 2 && (
            <button
              onClick={() => removeStop(selectedStopIndex)}
              className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => addStop(0.5)}
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {gradient.type === 'linear' && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="border-input flex h-7 flex-1 items-center rounded-md border px-2">
              <span className="text-muted-foreground mr-1 text-[10px]">Angle</span>
              <input
                value={gradient.angle ?? 0}
                onChange={(e) => handleAngleChange(e.target.value)}
                className="w-full bg-transparent text-right font-mono text-[11px] outline-none"
                maxLength={3}
              />
              <span className="text-muted-foreground ml-0.5 text-[10px]">&deg;</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
