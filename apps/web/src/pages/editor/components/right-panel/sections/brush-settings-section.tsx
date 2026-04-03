import type { PathShape, Shape, BrushSettings } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

export function BrushSettingsSection({ shape, onUpdate }: PropertySectionProps) {
  const path = shape as PathShape;
  const bs = path.brushSettings;
  if (!bs) return null;

  const update = (partial: Partial<BrushSettings>) => {
    onUpdate({ brushSettings: { ...bs, ...partial } } as Partial<Shape>);
  };

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Brush</h4>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="Size"
          value={bs.size}
          onChange={(v) => update({ size: v })}
          min={1}
          max={200}
          step={1}
        />
        <NumberInput
          label="Thin"
          value={bs.thinning}
          onChange={(v) => update({ thinning: v })}
          min={-1}
          max={1}
          step={0.05}
        />
        <NumberInput
          label="Smooth"
          value={bs.smoothing}
          onChange={(v) => update({ smoothing: v })}
          min={0}
          max={1}
          step={0.05}
        />
        <NumberInput
          label="Stream"
          value={bs.streamline}
          onChange={(v) => update({ streamline: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>
    </section>
  );
}
