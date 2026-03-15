import { useCallback } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import type { Fill, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';

const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

export function FillSection({ shape, onUpdate }: PropertySectionProps) {
  const fills = 'fills' in shape ? (shape as Shape & { fills: Fill[] }).fills : null;

  const updateFill = useCallback(
    (index: number, patch: Partial<Fill>) => {
      if (!fills) return;
      const next = fills.map((f, i) => (i === index ? { ...f, ...patch } : f));
      onUpdate({ fills: next } as Partial<Shape>);
    },
    [fills, onUpdate],
  );

  const removeFill = useCallback(
    (index: number) => {
      if (!fills) return;
      const next = fills.filter((_, i) => i !== index);
      onUpdate({ fills: next } as Partial<Shape>);
    },
    [fills, onUpdate],
  );

  const addFill = useCallback(() => {
    if (!fills) return;
    const newFill: Fill = { color: '#D9D9D9', opacity: 1, visible: true };
    onUpdate({ fills: [...fills, newFill] } as Partial<Shape>);
  }, [fills, onUpdate]);

  if (!fills) return null;

  return (
    <section>
      <div
        className={
          fills.length > 0
            ? 'mb-2 flex items-center justify-between'
            : 'flex items-center justify-between'
        }
      >
        <h4 className="text-muted-foreground text-[11px] font-medium">Fill</h4>
        <div className="flex items-center gap-0.5">
          <button
            onClick={addFill}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {[...fills].reverse().map((fill, reverseIndex) => {
          const index = fills.length - 1 - reverseIndex;
          return (
            <FillRow
              key={index}
              fill={fill}
              onColorChange={(color) => updateFill(index, { color })}
              onOpacityChange={(opacity) => updateFill(index, { opacity })}
              onRemove={() => removeFill(index)}
            />
          );
        })}
      </div>
    </section>
  );
}

function FillRow({
  fill,
  onColorChange,
  onOpacityChange,
  onRemove,
}: {
  fill: Fill;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onRemove: () => void;
}) {
  const opacityPercent = Math.round(fill.opacity * 100);

  return (
    <div className="flex items-center gap-1.5">
      <ColorPicker
        color={fill.color}
        opacity={fill.opacity}
        onChange={onColorChange}
        onOpacityChange={onOpacityChange}
      >
        <button className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2.5 rounded py-0.5">
          <div className="border-border relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded border">
            <div className="absolute inset-0" style={{ background: CHECKERBOARD }} />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: fill.color,
                opacity: fill.opacity,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: fill.color,
                clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
            <span className="truncate font-mono text-[11px] leading-snug">
              {fill.color.replace('#', '').toUpperCase()}
            </span>
            <span className="text-muted-foreground truncate text-[10px] leading-snug">
              {opacityPercent}% &middot; Solid
            </span>
          </div>
        </button>
      </ColorPicker>

      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
