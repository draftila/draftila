import { useCallback } from 'react';
import { ChevronDown, Eye, EyeOff, Minus, Plus } from 'lucide-react';
import type { Fill, Gradient, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';
import { GradientEditor, gradientPreviewCss } from '../../gradient-editor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

type FillType = 'solid' | 'linear' | 'radial';

function getFillType(fill: Fill): FillType {
  if (!fill.gradient) return 'solid';
  return fill.gradient.type;
}

function getFillTypeLabel(type: FillType): string {
  if (type === 'linear') return 'Linear';
  if (type === 'radial') return 'Radial';
  return 'Solid';
}

function defaultGradient(type: 'linear' | 'radial', baseColor: string): Gradient {
  if (type === 'linear') {
    return {
      type: 'linear',
      angle: 0,
      stops: [
        { color: baseColor, position: 0 },
        { color: '#000000', position: 1 },
      ],
    };
  }
  return {
    type: 'radial',
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    stops: [
      { color: baseColor, position: 0 },
      { color: '#000000', position: 1 },
    ],
  };
}

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

  const replaceFill = useCallback(
    (index: number, fill: Fill) => {
      if (!fills) return;
      const next = fills.map((f, i) => (i === index ? fill : f));
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
        <button
          onClick={addFill}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
        >
          Fill
        </button>
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
              onUpdate={(patch) => updateFill(index, patch)}
              onReplace={(f) => replaceFill(index, f)}
              onVisibleChange={(visible) => updateFill(index, { visible })}
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
  onUpdate,
  onReplace,
  onVisibleChange,
  onRemove,
}: {
  fill: Fill;
  onUpdate: (patch: Partial<Fill>) => void;
  onReplace: (fill: Fill) => void;
  onVisibleChange: (visible: boolean) => void;
  onRemove: () => void;
}) {
  const opacityPercent = Math.round(fill.opacity * 100);
  const fillType = getFillType(fill);

  const handleTypeChange = (newType: FillType) => {
    if (newType === fillType) return;
    if (newType === 'solid') {
      const baseColor = fill.gradient?.stops[0]?.color ?? fill.color;
      onReplace({ color: baseColor, opacity: fill.opacity, visible: fill.visible });
      return;
    }
    const gradient = defaultGradient(newType, fill.color);
    onReplace({ ...fill, gradient });
  };

  const handleGradientChange = (gradient: Gradient) => {
    onReplace({ ...fill, gradient });
  };

  const displayLabel = fill.gradient
    ? (fill.gradient.stops[0]?.color ?? fill.color).replace('#', '').toUpperCase()
    : fill.color.replace('#', '').toUpperCase();

  const editorContent = (
    <button
      className={`hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2.5 rounded py-0.5 ${!fill.visible ? 'opacity-50' : ''}`}
    >
      <div className="border-border relative h-[36px] w-[36px] shrink-0 overflow-hidden rounded border">
        <div className="absolute inset-0" style={{ background: CHECKERBOARD }} />
        {fill.gradient ? (
          <div
            className="absolute inset-0"
            style={{
              background: gradientPreviewCss(fill.gradient),
              opacity: fill.opacity,
            }}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
        <span className="truncate font-mono text-[11px] leading-snug">{displayLabel}</span>
        <span className="text-muted-foreground truncate text-[10px] leading-snug">
          {opacityPercent}% &middot; {getFillTypeLabel(fillType)}
        </span>
      </div>
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      {fill.gradient ? (
        <GradientEditor gradient={fill.gradient} onChange={handleGradientChange}>
          {editorContent}
        </GradientEditor>
      ) : (
        <ColorPicker
          color={fill.color}
          opacity={fill.opacity}
          onChange={(color) => onUpdate({ color })}
          onOpacityChange={(opacity) => onUpdate({ opacity })}
        >
          {editorContent}
        </ColorPicker>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground shrink-0 text-[10px] transition-colors">
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[100px]">
          <DropdownMenuItem onClick={() => handleTypeChange('solid')}>
            <span className={fillType === 'solid' ? 'font-medium' : ''}>Solid</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleTypeChange('linear')}>
            <span className={fillType === 'linear' ? 'font-medium' : ''}>Linear</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleTypeChange('radial')}>
            <span className={fillType === 'radial' ? 'font-medium' : ''}>Radial</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        onClick={() => onVisibleChange(!fill.visible)}
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        {fill.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
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
