import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';
import { useVariables } from '../../hooks/use-variables';

type ShapeWithStrokes = Shape & {
  strokes?: Array<{
    color: string;
    colorVar?: string;
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
  const { resolve, byId } = useVariables();
  const strokes = (shape as ShapeWithStrokes).strokes;
  if (!strokes || strokes.length === 0) return null;

  const visibleStrokes = strokes.filter((s) => s.visible);
  if (visibleStrokes.length === 0) return null;

  return (
    <InspectSection title="Stroke">
      {visibleStrokes.map((stroke, i) => {
        const prefix = visibleStrokes.length > 1 ? `${i + 1} ` : '';
        const color = resolve(stroke.color, stroke.colorVar) ?? stroke.color;
        const name = stroke.colorVar ? byId.get(stroke.colorVar)?.name : undefined;
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <InspectPropertyRow
              label={`${prefix}Color`}
              value={`${name ? `${name} \u00B7 ` : ''}${color.toUpperCase()}`}
              colorSwatch={color}
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
