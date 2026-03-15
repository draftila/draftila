import type { Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ColorPicker } from '../../color-picker';

export function FillSection({ shape, onUpdate }: PropertySectionProps) {
  if (!('fill' in shape)) return null;

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Fill</h4>
      <ColorPicker
        color={(shape as Shape & { fill: string | null }).fill}
        onChange={(color) => onUpdate({ fill: color } as Partial<Shape>)}
      />
    </section>
  );
}
