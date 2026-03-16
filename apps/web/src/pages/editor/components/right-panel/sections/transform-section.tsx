import type { Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

export function TransformSection({ shape, onUpdate }: PropertySectionProps) {
  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Transform</h4>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="X"
          value={shape.x}
          onChange={(v) => onUpdate({ x: v } as Partial<Shape>)}
        />
        <NumberInput
          label="Y"
          value={shape.y}
          onChange={(v) => onUpdate({ y: v } as Partial<Shape>)}
        />
        <NumberInput
          label="W"
          value={shape.width}
          onChange={(v) => onUpdate({ width: v } as Partial<Shape>)}
        />
        <NumberInput
          label="H"
          value={shape.height}
          onChange={(v) => onUpdate({ height: v } as Partial<Shape>)}
        />
      </div>
      <div className="mt-1.5">
        <NumberInput
          label="R"
          value={shape.rotation}
          onChange={(v) => onUpdate({ rotation: v } as Partial<Shape>)}
          step={15}
        />
      </div>
    </section>
  );
}
