import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';
import { useVariables } from '../../hooks/use-variables';

type ShapeWithFills = Shape & {
  fills?: Array<{
    color?: string;
    colorVar?: string;
    opacity: number;
    visible: boolean;
    gradient?: {
      type: string;
      stops: Array<{ color: string; colorVar?: string; position: number }>;
    };
  }>;
};

type Resolve = (color: string | undefined, colorVar: string | undefined) => string | undefined;

function formatGradient(
  gradient: {
    type: string;
    stops: Array<{ color: string; colorVar?: string; position: number }>;
  },
  resolve: Resolve,
): string {
  const stops = gradient.stops.map((s) => resolve(s.color, s.colorVar) ?? s.color).join(', ');
  return `${gradient.type}(${stops})`;
}

export function InspectFill({ shape }: { shape: Shape }) {
  const { resolve, byId } = useVariables();
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
              value={formatGradient(fill.gradient, resolve)}
            />
          );
        }
        const opacity = fill.opacity !== 1 ? ` ${Math.round(fill.opacity * 100)}%` : '';
        // A fill may carry only a colorVar (see fillSchema's refine), so `color`
        // can legitimately be absent once the variable is missing too.
        const resolved = resolve(fill.color, fill.colorVar);
        if (!resolved) return null;
        const name = fill.colorVar ? byId.get(fill.colorVar)?.name : undefined;
        return (
          <InspectPropertyRow
            key={i}
            label={visibleFills.length > 1 ? `Fill ${i + 1}` : 'Color'}
            value={`${name ? `${name} · ` : ''}${resolved.toUpperCase()}${opacity}`}
            colorSwatch={resolved}
          />
        );
      })}
    </InspectSection>
  );
}
