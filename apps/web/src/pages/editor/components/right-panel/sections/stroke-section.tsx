import type { Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';
import { NumberInput } from '../number-input';

export function StrokeSection({ shape, onUpdate }: PropertySectionProps) {
  if (!('stroke' in shape)) return null;

  const typedShape = shape as Shape & { stroke: string | null; strokeWidth: number };

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Stroke</h4>
      <ColorPicker
        color={typedShape.stroke}
        onChange={(color) => onUpdate({ stroke: color } as Partial<Shape>)}
      />
      <div className="mt-1.5">
        <NumberInput
          label="W"
          value={typedShape.strokeWidth}
          onChange={(v) => onUpdate({ strokeWidth: Math.max(0, v) } as Partial<Shape>)}
        />
      </div>
    </section>
  );
}
