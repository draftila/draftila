import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type ShapeWithFills = Shape & {
  fills?: Array<{
    color: string;
    opacity: number;
    visible: boolean;
    gradient?: { type: string; stops: Array<{ color: string; position: number }> };
  }>;
};

function formatGradient(gradient: {
  type: string;
  stops: Array<{ color: string; position: number }>;
}): string {
  const stops = gradient.stops.map((s) => s.color).join(', ');
  return `${gradient.type}(${stops})`;
}

export function InspectFill({ shape }: { shape: Shape }) {
  const fills = (shape as ShapeWithFills).fills;
  if (!fills || fills.length === 0) return null;

  const visibleFills = fills.filter((f) => f.visible);
  if (visibleFills.length === 0) return null;

  return (
    <InspectSection title="Fill">
      {visibleFills.map((fill, i) => {
        if (fill.gradient) {
          return (
            <InspectPropertyRow
              key={i}
              label={visibleFills.length > 1 ? `Fill ${i + 1}` : 'Gradient'}
              value={formatGradient(fill.gradient)}
            />
          );
        }
        const opacity = fill.opacity !== 1 ? ` ${Math.round(fill.opacity * 100)}%` : '';
        return (
          <InspectPropertyRow
            key={i}
            label={visibleFills.length > 1 ? `Fill ${i + 1}` : 'Color'}
            value={`${fill.color.toUpperCase()}${opacity}`}
            colorSwatch={fill.color}
          />
        );
      })}
    </InspectSection>
  );
}
