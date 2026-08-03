import type { Fill, Gradient, Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';
import { useVariables } from '../../hooks/use-variables';

type ShapeWithFills = Shape & { fills?: Fill[] };

type Resolve = (color: string | undefined, colorVar: string | undefined) => string | undefined;

const IMAGE_FIT_LABELS: Record<NonNullable<Fill['imageFit']>, string> = {
  fill: 'Fill',
  fit: 'Fit',
  crop: 'Crop',
  tile: 'Tile',
};

function formatGradient(gradient: Gradient, resolve: Resolve): string {
  const stops = gradient.stops.map((s) => resolve(s.color, s.colorVar) ?? s.color).join(', ');
  return `${gradient.type}(${stops})`;
}

function formatOpacity(opacity: number): string {
  return opacity !== 1 ? ` ${Math.round(opacity * 100)}%` : '';
}

export function InspectFill({ shape }: { shape: Shape }) {
  const { resolve, byId } = useVariables();
  const fills = (shape as ShapeWithFills).fills;
  if (!fills || fills.length === 0) return null;

  const visibleFills = fills.filter(
    (f) => f.visible && (f.imageSrc || f.gradient || f.color || f.colorVar),
  );
  if (visibleFills.length === 0) return null;

  return (
    <InspectSection title="Fill">
      {visibleFills.map((fill, i) => {
        const indexLabel = visibleFills.length > 1 ? `Fill ${i + 1}` : null;

        // Gradient, then image, then colour — the order fillToCssValue uses, so the List and
        // Code tabs never disagree about which layer of a fill is the one on show.
        if (fill.gradient) {
          return (
            <InspectPropertyRow
              key={i}
              label={indexLabel ?? 'Gradient'}
              value={formatGradient(fill.gradient, resolve)}
            />
          );
        }

        if (fill.imageSrc) {
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <InspectPropertyRow
                label={indexLabel ?? 'Image'}
                value={`${IMAGE_FIT_LABELS[fill.imageFit ?? 'fill']}${formatOpacity(fill.opacity)}`}
              />
              <InspectPropertyRow label="Source" value={fill.imageSrc} />
            </div>
          );
        }

        const color = resolve(fill.color, fill.colorVar);
        if (!color) return null;
        const name = fill.colorVar ? byId.get(fill.colorVar)?.name : undefined;

        return (
          <InspectPropertyRow
            key={i}
            label={indexLabel ?? 'Color'}
            value={`${name ? `${name} · ` : ''}${color.toUpperCase()}${formatOpacity(fill.opacity)}`}
            colorSwatch={color}
          />
        );
      })}
    </InspectSection>
  );
}
