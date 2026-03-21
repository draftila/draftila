import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, Plus, X } from 'lucide-react';
import type { LayoutGuide, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';
import { NumberInput } from '../number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DEFAULT_GUIDE: LayoutGuide = {
  type: 'grid',
  size: 10,
  color: '#FF000019',
  visible: true,
};

const GUIDE_TYPE_LABELS: Record<LayoutGuide['type'], string> = {
  grid: 'Grid',
  columns: 'Columns',
  rows: 'Rows',
};

function parseOpacity(hex: string): number {
  if (hex.length === 9) return parseInt(hex.slice(7, 9), 16) / 255;
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

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="5" height="5" fill="currentColor" opacity="0.4" />
      <rect x="8" y="1" width="5" height="5" fill="currentColor" opacity="0.4" />
      <rect x="1" y="8" width="5" height="5" fill="currentColor" opacity="0.4" />
      <rect x="8" y="8" width="5" height="5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function LayoutGuideSection({ shape, onUpdate }: PropertySectionProps) {
  const guides: LayoutGuide[] = useMemo(
    () => ('guides' in shape ? (shape as Shape & { guides: LayoutGuide[] }).guides : []),
    [shape],
  );
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const updateGuide = useCallback(
    (index: number, patch: Partial<LayoutGuide>) => {
      const next = guides.map((g, i) => (i === index ? { ...g, ...patch } : g));
      onUpdate({ guides: next } as Partial<Shape>);
    },
    [guides, onUpdate],
  );

  const removeGuide = useCallback(
    (index: number) => {
      const next = guides.filter((_, i) => i !== index);
      onUpdate({ guides: next } as Partial<Shape>);
    },
    [guides, onUpdate],
  );

  const addGuide = useCallback(
    (type: LayoutGuide['type']) => {
      onUpdate({ guides: [...guides, { ...DEFAULT_GUIDE, type }] } as Partial<Shape>);
    },
    [guides, onUpdate],
  );

  if (shape.type !== 'frame') return null;

  return (
    <section>
      <div
        className={
          guides.length > 0
            ? 'mb-2 flex items-center justify-between'
            : 'flex items-center justify-between'
        }
      >
        <button
          onClick={() => addGuide('grid')}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
        >
          Layout guide
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => addGuide('grid')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
            <PopoverTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" className="w-36 p-1">
              {(['grid', 'columns', 'rows'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    addGuide(t);
                    setAddMenuOpen(false);
                  }}
                  className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px]"
                >
                  <GridIcon className="h-3.5 w-3.5" />
                  {GUIDE_TYPE_LABELS[t]}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="space-y-1.5">
        {[...guides].reverse().map((guide, ri) => {
          const index = guides.length - 1 - ri;
          return (
            <GuideEntry
              key={index}
              guide={guide}
              onUpdate={(patch) => updateGuide(index, patch)}
              onRemove={() => removeGuide(index)}
            />
          );
        })}
      </div>
    </section>
  );
}

function GuideEntry({
  guide,
  onUpdate,
  onRemove,
}: {
  guide: LayoutGuide;
  onUpdate: (patch: Partial<LayoutGuide>) => void;
  onRemove: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const visible = guide.visible !== false;

  return (
    <div>
      <Popover open={detailOpen} onOpenChange={setDetailOpen}>
        <div className="flex items-center gap-1.5">
          <PopoverTrigger asChild>
            <button
              className={`hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 ${!visible ? 'opacity-50' : ''}`}
            >
              <GridIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[11px] leading-snug">
                  {GUIDE_TYPE_LABELS[guide.type]}
                </span>
                <span className="text-muted-foreground truncate text-[10px] leading-snug">
                  {guide.size}px
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
        <GuideDetailPopover
          guide={guide}
          onUpdate={onUpdate}
          onClose={() => setDetailOpen(false)}
        />
      </Popover>
    </div>
  );
}

function GuideDetailPopover({
  guide,
  onUpdate,
  onClose,
}: {
  guide: LayoutGuide;
  onUpdate: (patch: Partial<LayoutGuide>) => void;
  onClose: () => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const opacity = parseOpacity(guide.color);
  const baseColor = stripAlpha(guide.color);
  const opacityPercent = Math.round(opacity * 100);

  const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

  return (
    <PopoverContent side="left" align="start" className="w-64">
      <div className="flex items-center justify-between">
        <Popover open={typeOpen} onOpenChange={setTypeOpen}>
          <PopoverTrigger asChild>
            <button className="bg-muted hover:bg-muted/80 flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium">
              {GUIDE_TYPE_LABELS[guide.type]}
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-36 p-1">
            {(['grid', 'columns', 'rows'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  onUpdate({ type: t });
                  setTypeOpen(false);
                }}
                className={`flex w-full items-center rounded px-2 py-1.5 text-[11px] ${
                  guide.type === t ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
              >
                {GUIDE_TYPE_LABELS[t]}
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
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-[11px] font-medium">Size</span>
          <div className="w-20">
            <NumberInput
              label=""
              value={guide.size}
              onChange={(size) => onUpdate({ size })}
              min={1}
              step={1}
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
