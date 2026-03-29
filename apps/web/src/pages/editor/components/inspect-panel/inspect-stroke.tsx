import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type ShapeWithStrokes = Shape & {
  strokes?: Array<{
    color: string;
    width: number;
    opacity: number;
    visible: boolean;
    align: string;
    cap: string;
    join: string;
    dashPattern: string;
  }>;
};

export function InspectStroke({ shape }: { shape: Shape }) {
  const strokes = (shape as ShapeWithStrokes).strokes;
  if (!strokes || strokes.length === 0) return null;

  const visibleStrokes = strokes.filter((s) => s.visible);
  if (visibleStrokes.length === 0) return null;

  return (
    <InspectSection title="Stroke">
      {visibleStrokes.map((stroke, i) => {
        const prefix = visibleStrokes.length > 1 ? `${i + 1} ` : '';
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <InspectPropertyRow
              label={`${prefix}Color`}
              value={stroke.color.toUpperCase()}
              colorSwatch={stroke.color}
            />
            <InspectPropertyRow label={`${prefix}Width`} value={`${stroke.width}`} />
            {stroke.opacity !== 1 && (
              <InspectPropertyRow
                label={`${prefix}Opacity`}
                value={`${Math.round(stroke.opacity * 100)}%`}
              />
            )}
            <InspectPropertyRow label={`${prefix}Position`} value={stroke.align} />
            {stroke.dashPattern !== 'solid' && (
              <InspectPropertyRow label={`${prefix}Dash`} value={stroke.dashPattern} />
            )}
          </div>
        );
      })}
    </InspectSection>
  );
}
