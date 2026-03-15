import type { PolygonShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

export function SidesSection({ shape, onUpdate }: PropertySectionProps) {
  const polygon = shape as PolygonShape;

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Sides</h4>
      <NumberInput
        label="N"
        value={polygon.sides}
        onChange={(v) => onUpdate({ sides: Math.max(3, Math.round(v)) } as Partial<Shape>)}
      />
    </section>
  );
}
