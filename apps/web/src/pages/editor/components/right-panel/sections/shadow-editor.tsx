import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, X } from 'lucide-react';
import type { Shadow } from '@draftila/shared';
import { ColorPicker } from '../../color-picker';
import { NumberInput } from '../number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const DEFAULT_SHADOW: Shadow = {
  type: 'drop',
  x: 0,
  y: 4,
  blur: 4,
  spread: 0,
  color: '#00000040',
  visible: true,
};

export const SHADOW_TYPE_LABELS: Record<Shadow['type'], string> = {
  drop: 'Drop shadow',
  inner: 'Inner shadow',
};

function parseOpacity(hex: string): number {
  if (hex.length === 9) {
    return parseInt(hex.slice(7, 9), 16) / 255;
  }
  return 1;
}

function stripAlpha(hex: string): string {
  if (hex.length === 9) return hex.slice(0, 7);
  return hex;
}

function applyAlpha(hex: string, opacity: number): string {
  const base = stripAlpha(hex);
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return `${base}${alpha}`;
}

function shadowSummary(s: Shadow): string {
  return `X ${s.x} \u00B7 Y ${s.y} \u00B7 B ${s.blur} \u00B7 S ${s.spread}`;
}

export function ShadowIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function BlurIcon({ className }: { className?: string }) {
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

function SpreadIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

export function ShadowEntry({
  shadow,
  onUpdate,
  onRemove,
}: {
  shadow: Shadow;
  onUpdate: (patch: Partial<Shadow>) => void;
  onRemove: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const opacity = parseOpacity(shadow.color);
  const baseColor = stripAlpha(shadow.color);
  const visible = shadow.visible !== false;

  return (
    <div>
      <Popover open={detailOpen} onOpenChange={setDetailOpen}>
        <div className="flex items-center gap-1.5">
          <PopoverTrigger asChild>
            <button
              className={`hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 ${!visible ? 'opacity-50' : ''}`}
            >
              <ShadowIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[11px] leading-snug">
                  {SHADOW_TYPE_LABELS[shadow.type]}
                </span>
                <span className="text-muted-foreground truncate text-[10px] leading-snug">
                  {shadowSummary(shadow)}
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
        <ShadowDetailPopover
          shadow={shadow}
          opacity={opacity}
          baseColor={baseColor}
          onUpdate={onUpdate}
          onClose={() => setDetailOpen(false)}
        />
      </Popover>
    </div>
  );
}

function ShadowDetailPopover({
  shadow,
  opacity,
  baseColor,
  onUpdate,
  onClose,
}: {
  shadow: Shadow;
  opacity: number;
  baseColor: string;
  onUpdate: (patch: Partial<Shadow>) => void;
  onClose: () => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const opacityPercent = Math.round(opacity * 100);

  const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

  return (
    <PopoverContent side="left" align="start" className="w-64">
      <div className="flex items-center justify-between">
        <Popover open={typeOpen} onOpenChange={setTypeOpen}>
          <PopoverTrigger asChild>
            <button className="bg-muted hover:bg-muted/80 flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium">
              {SHADOW_TYPE_LABELS[shadow.type]}
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-36 p-1">
            {(['drop', 'inner'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  onUpdate({ type: t });
                  setTypeOpen(false);
                }}
                className={`flex w-full items-center rounded px-2 py-1.5 text-[11px] ${
                  shadow.type === t ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
              >
                {SHADOW_TYPE_LABELS[t]}
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

      <div className="mt-3 space-y-3">
        <div>
          <span className="text-muted-foreground text-[11px] font-medium">Position</span>
          <div className="mt-1.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0">
                <NumberInput
                  label="X"
                  value={shadow.x}
                  onChange={(x) => onUpdate({ x })}
                  step={1}
                />
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={shadow.x}
                onChange={(e) => onUpdate({ x: parseInt(e.target.value, 10) })}
                className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0">
                <NumberInput
                  label="Y"
                  value={shadow.y}
                  onChange={(y) => onUpdate({ y })}
                  step={1}
                />
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={shadow.y}
                onChange={(e) => onUpdate({ y: parseInt(e.target.value, 10) })}
                className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div>
          <span className="text-muted-foreground text-[11px] font-medium">Blur</span>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="w-16 shrink-0">
              <NumberInput
                label=""
                icon={<BlurIcon className="h-3.5 w-3.5" />}
                value={shadow.blur}
                onChange={(blur) => onUpdate({ blur })}
                min={0}
                step={1}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={shadow.blur}
              onChange={(e) => onUpdate({ blur: parseInt(e.target.value, 10) })}
              className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <span className="text-muted-foreground text-[11px] font-medium">Spread</span>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="w-16 shrink-0">
              <NumberInput
                label=""
                icon={<SpreadIcon className="h-3.5 w-3.5" />}
                value={shadow.spread}
                onChange={(spread) => onUpdate({ spread })}
                step={1}
              />
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={shadow.spread}
              onChange={(e) => onUpdate({ spread: parseInt(e.target.value, 10) })}
              className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <span className="text-muted-foreground text-[11px] font-medium">Color</span>
          <div className="mt-1.5">
            <ColorPicker
              color={baseColor}
              opacity={opacity}
              onChange={(color) => onUpdate({ color: applyAlpha(color, opacity) })}
              onOpacityChange={(op) => onUpdate({ color: applyAlpha(baseColor, op) })}
            >
              <button className="hover:bg-muted/50 flex w-full items-center gap-2.5 rounded py-0.5">
                <div className="border-border relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded border">
                  <div className="absolute inset-0" style={{ background: CHECKERBOARD }} />
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: baseColor, opacity }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: baseColor,
                      clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
                    }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-mono text-[11px]">
                    {baseColor.replace('#', '').toUpperCase()}
                  </span>
                  <span className="text-muted-foreground text-[11px]">{opacityPercent}%</span>
                </div>
              </button>
            </ColorPicker>
          </div>
        </div>
      </div>
    </PopoverContent>
  );
}
