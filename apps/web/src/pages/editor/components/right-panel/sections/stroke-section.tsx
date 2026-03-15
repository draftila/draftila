import { useCallback } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, Plus } from 'lucide-react';
import type { Stroke, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';

const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

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
    const newStroke: Stroke = { color: '#000000', width: 1, opacity: 1, visible: true };
    onUpdate({ strokes: [...strokes, newStroke] } as Partial<Shape>);
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
      <div className="space-y-1.5">
        {[...strokes].reverse().map((stroke, reverseIndex) => {
          const index = strokes.length - 1 - reverseIndex;
          return (
            <StrokeRow
              key={index}
              stroke={stroke}
              onColorChange={(color) => updateStroke(index, { color })}
              onWidthChange={(width) => updateStroke(index, { width })}
              onOpacityChange={(opacity) => updateStroke(index, { opacity })}
              onVisibilityToggle={() => updateStroke(index, { visible: !stroke.visible })}
              onRemove={() => removeStroke(index)}
            />
          );
        })}
      </div>
    </section>
  );
}

function StrokeRow({
  stroke,
  onColorChange,
  onWidthChange: _onWidthChange,
  onOpacityChange,
  onVisibilityToggle,
  onRemove,
}: {
  stroke: Stroke;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onOpacityChange: (opacity: number) => void;
  onVisibilityToggle: () => void;
  onRemove: () => void;
}) {
  const opacityPercent = Math.round(stroke.opacity * 100);

  return (
    <div className="flex items-center gap-1.5">
      <ColorPicker
        color={stroke.color}
        opacity={stroke.opacity}
        onChange={onColorChange}
        onOpacityChange={onOpacityChange}
      >
        <button className="flex min-w-0 flex-1 items-center gap-2.5 rounded py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
          <div className="relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded border border-black/10">
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
        onClick={onVisibilityToggle}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        {stroke.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
