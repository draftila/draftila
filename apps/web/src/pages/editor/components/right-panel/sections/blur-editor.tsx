import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, X } from 'lucide-react';
import type { Blur } from '@draftila/shared';
import { NumberInput } from '../number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const DEFAULT_BLUR: Blur = {
  type: 'layer',
  radius: 4,
  visible: true,
};

export const BLUR_TYPE_LABELS: Record<Blur['type'], string> = {
  layer: 'Layer blur',
  background: 'Background blur',
};

function blurSummary(b: Blur): string {
  return `${b.radius}`;
}

export function BlurIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
      <circle cx="7" cy="7" r="2.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function BlurEntry({
  blur,
  onUpdate,
  onRemove,
}: {
  blur: Blur;
  onUpdate: (patch: Partial<Blur>) => void;
  onRemove: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const visible = blur.visible !== false;

  return (
    <div>
      <Popover open={detailOpen} onOpenChange={setDetailOpen}>
        <div className="flex items-center gap-1.5">
          <PopoverTrigger asChild>
            <button
              className={`hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 ${!visible ? 'opacity-50' : ''}`}
            >
              <BlurIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[11px] leading-snug">
                  {BLUR_TYPE_LABELS[blur.type]}
                </span>
                <span className="text-muted-foreground truncate text-[10px] leading-snug">
                  Radius {blurSummary(blur)}
                </span>
              </div>
            </button>
          </PopoverTrigger>
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
        <BlurDetailPopover blur={blur} onUpdate={onUpdate} onClose={() => setDetailOpen(false)} />
      </Popover>
    </div>
  );
}

function BlurDetailPopover({
  blur,
  onUpdate,
  onClose,
}: {
  blur: Blur;
  onUpdate: (patch: Partial<Blur>) => void;
  onClose: () => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);

  return (
    <PopoverContent side="left" align="start" className="w-64">
      <div className="flex items-center justify-between">
        <Popover open={typeOpen} onOpenChange={setTypeOpen}>
          <PopoverTrigger asChild>
            <button className="bg-muted hover:bg-muted/80 flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium">
              {BLUR_TYPE_LABELS[blur.type]}
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-40 p-1">
            {(['layer', 'background'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  onUpdate({ type: t });
                  setTypeOpen(false);
                }}
                className={`flex w-full items-center rounded px-2 py-1.5 text-[11px] ${
                  blur.type === t ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
              >
                {BLUR_TYPE_LABELS[t]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3">
        <span className="text-muted-foreground text-[11px] font-medium">Radius</span>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="w-16 shrink-0">
            <NumberInput
              label=""
              icon={<BlurIcon className="h-3.5 w-3.5" />}
              value={blur.radius}
              onChange={(radius) => onUpdate({ radius })}
              min={0}
              step={1}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={blur.radius}
            onChange={(e) => onUpdate({ radius: parseInt(e.target.value, 10) })}
            className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
          />
        </div>
      </div>
    </PopoverContent>
  );
}
