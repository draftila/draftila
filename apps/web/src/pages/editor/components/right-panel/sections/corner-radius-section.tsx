import type { RectangleShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

export function CornerRadiusSection({ shape, onUpdate }: PropertySectionProps) {
  const rect = shape as RectangleShape;

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Corner Radius</h4>
      <NumberInput
        label="R"
        value={rect.cornerRadius}
        onChange={(v) => onUpdate({ cornerRadius: v } as Partial<Shape>)}
        min={0}
      />
    </section>
  );
}
