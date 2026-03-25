import { useCallback, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { ArrowheadType, Stroke, StrokeSides } from '@draftila/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NumberInput } from '../number-input';
import { ARROWHEAD_LABELS, ENDPOINT_OPTIONS, endpointIcon } from './stroke-constants';

export function EndpointDropdown({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ArrowheadType;
  onChange: (val: ArrowheadType) => void;
}) {
  const [open, setOpen] = useState(false);
  const committedRef = useRef(value);
  const didCommitRef = useRef(false);
  const CurrentIcon = endpointIcon(value);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        committedRef.current = value;
        didCommitRef.current = false;
      } else if (!didCommitRef.current) {
        onChange(committedRef.current);
      }
      setOpen(nextOpen);
    },
    [value, onChange],
  );

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground w-8 shrink-0 text-[10px]">{label}</span>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="border-input flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-1.5">
            <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left text-[11px]">
              {ARROWHEAD_LABELS[value]}
            </span>
            <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="start"
          className="w-48 p-0"
          onPointerLeave={() => onChange(committedRef.current)}
        >
          <div className="flex flex-col py-1">
            {ENDPOINT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onPointerEnter={() => onChange(opt.value)}
                onClick={() => {
                  committedRef.current = opt.value;
                  didCommitRef.current = true;
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-[11px] transition-colors ${
                  committedRef.current === opt.value
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/50'
                }`}
              >
                <opt.Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function StrokeSettingsPopover({
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

      <div className="mt-3 space-y-2">
        <span className="text-muted-foreground text-[11px] font-medium">Sides</span>
        <StrokeSidesToggle sides={stroke.sides} onChange={(sides) => onUpdate({ sides })} />
      </div>
    </PopoverContent>
  );
}

export function StrokeSidesToggle({
  sides,
  onChange,
}: {
  sides?: StrokeSides;
  onChange: (sides: StrokeSides | undefined) => void;
}) {
  const allSides = !sides || (sides.top && sides.right && sides.bottom && sides.left);

  const currentSides: StrokeSides = sides ?? {
    top: true,
    right: true,
    bottom: true,
    left: true,
  };

  const toggleSide = (side: keyof StrokeSides) => {
    const next = { ...currentSides, [side]: !currentSides[side] };
    const allTrue = next.top && next.right && next.bottom && next.left;
    onChange(allTrue ? undefined : next);
  };

  const sideButtons: Array<{ key: keyof StrokeSides; label: string }> = [
    { key: 'top', label: 'T' },
    { key: 'right', label: 'R' },
    { key: 'bottom', label: 'B' },
    { key: 'left', label: 'L' },
  ];

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(undefined)}
        className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
          allSides
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        All
      </button>
      {sideButtons.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => toggleSide(key)}
          className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
            currentSides[key]
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
