import type { StarShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

export function StarSection({ shape, onUpdate }: PropertySectionProps) {
  const star = shape as StarShape;

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Star</h4>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="Pt"
          value={star.points}
          onChange={(v) => onUpdate({ points: Math.round(v) } as Partial<Shape>)}
          min={3}
        />
        <NumberInput
          label="In"
          value={star.innerRadius}
          onChange={(v) => onUpdate({ innerRadius: v } as Partial<Shape>)}
          step={0.05}
          min={0.01}
          max={1}
        />
      </div>
    </section>
  );
}
