import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { Blur, Shadow, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ShadowEntry, ShadowIcon, DEFAULT_SHADOW } from './shadow-editor';
import { BlurEntry, BlurIcon, DEFAULT_BLUR } from './blur-editor';

type EffectItem =
  | { kind: 'shadow'; index: number; value: Shadow }
  | { kind: 'blur'; index: number; value: Blur };

export function EffectsSection({ shape, onUpdate }: PropertySectionProps) {
  const shadows: Shadow[] = useMemo(
    () => ('shadows' in shape ? (shape as Shape & { shadows: Shadow[] }).shadows : []),
    [shape],
  );
  const blurs: Blur[] = useMemo(
    () => ('blurs' in shape ? (shape as Shape & { blurs: Blur[] }).blurs : []),
    [shape],
  );
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const updateShadow = useCallback(
    (index: number, patch: Partial<Shadow>) => {
      const next = shadows.map((s, i) => (i === index ? { ...s, ...patch } : s));
      onUpdate({ shadows: next } as Partial<Shape>);
    },
    [shadows, onUpdate],
  );

  const removeShadow = useCallback(
    (index: number) => {
      const next = shadows.filter((_, i) => i !== index);
      onUpdate({ shadows: next } as Partial<Shape>);
    },
    [shadows, onUpdate],
  );

  const addShadow = useCallback(
    (type: Shadow['type']) => {
      onUpdate({ shadows: [...shadows, { ...DEFAULT_SHADOW, type }] } as Partial<Shape>);
    },
    [shadows, onUpdate],
  );

  const updateBlur = useCallback(
    (index: number, patch: Partial<Blur>) => {
      const next = blurs.map((b, i) => (i === index ? { ...b, ...patch } : b));
      onUpdate({ blurs: next } as Partial<Shape>);
    },
    [blurs, onUpdate],
  );

  const removeBlur = useCallback(
    (index: number) => {
      const next = blurs.filter((_, i) => i !== index);
      onUpdate({ blurs: next } as Partial<Shape>);
    },
    [blurs, onUpdate],
  );

  const addBlur = useCallback(
    (type: Blur['type']) => {
      onUpdate({ blurs: [...blurs, { ...DEFAULT_BLUR, type }] } as Partial<Shape>);
    },
    [blurs, onUpdate],
  );

  const effectItems: EffectItem[] = [];
  [...shadows].reverse().forEach((s, ri) => {
    effectItems.push({ kind: 'shadow', index: shadows.length - 1 - ri, value: s });
  });
  [...blurs].reverse().forEach((b, ri) => {
    effectItems.push({ kind: 'blur', index: blurs.length - 1 - ri, value: b });
  });

  return (
    <section>
      <div
        className={
          effectItems.length > 0
            ? 'mb-2 flex items-center justify-between'
            : 'flex items-center justify-between'
        }
      >
        <button
          onClick={() => addShadow('drop')}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
        >
          Effects
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => addShadow('drop')}
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
            <PopoverContent side="left" align="start" className="w-40 p-1">
              <button
                onClick={() => {
                  addShadow('drop');
                  setAddMenuOpen(false);
                }}
                className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px]"
              >
                <ShadowIcon className="h-3.5 w-3.5" />
                Drop shadow
              </button>
              <button
                onClick={() => {
                  addShadow('inner');
                  setAddMenuOpen(false);
                }}
                className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px]"
              >
                <ShadowIcon className="h-3.5 w-3.5" />
                Inner shadow
              </button>
              <button
                onClick={() => {
                  addBlur('layer');
                  setAddMenuOpen(false);
                }}
                className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px]"
              >
                <BlurIcon className="h-3.5 w-3.5" />
                Layer blur
              </button>
              <button
                onClick={() => {
                  addBlur('background');
                  setAddMenuOpen(false);
                }}
                className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px]"
              >
                <BlurIcon className="h-3.5 w-3.5" />
                Background blur
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="space-y-1.5">
        {effectItems.map((item) =>
          item.kind === 'shadow' ? (
            <ShadowEntry
              key={`shadow-${item.index}`}
              shadow={item.value}
              onUpdate={(patch) => updateShadow(item.index, patch)}
              onRemove={() => removeShadow(item.index)}
            />
          ) : (
            <BlurEntry
              key={`blur-${item.index}`}
              blur={item.value}
              onUpdate={(patch) => updateBlur(item.index, patch)}
              onRemove={() => removeBlur(item.index)}
            />
          ),
        )}
      </div>
    </section>
  );
}
