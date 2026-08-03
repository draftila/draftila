import type { Fill, Gradient, Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type ShapeWithFills = Shape & { fills?: Fill[] };

const IMAGE_FIT_LABELS: Record<NonNullable<Fill['imageFit']>, string> = {
  fill: 'Fill',
  fit: 'Fit',
  crop: 'Crop',
  tile: 'Tile',
};

function formatGradient(gradient: Gradient): string {
  const stops = gradient.stops.map((s) => s.color).join(', ');
  return `${gradient.type}(${stops})`;
}

function formatOpacity(opacity: number): string {
  return opacity !== 1 ? ` ${Math.round(opacity * 100)}%` : '';
}

export function InspectFill({ shape }: { shape: Shape }) {
  const fills = (shape as ShapeWithFills).fills;
  if (!fills || fills.length === 0) return null;

  const visibleFills = fills.filter((f) => f.visible && (f.imageSrc || f.gradient || f.color));
  if (visibleFills.length === 0) return null;

  return (
    <InspectSection title="Fill">
      {visibleFills.map((fill, i) => {
        const indexLabel = visibleFills.length > 1 ? `Fill ${i + 1}` : null;

        // Matches the renderer's precedence: an image fill paints over any colour it carries.
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

        if (fill.gradient) {
          return (
            <InspectPropertyRow
              key={i}
              label={indexLabel ?? 'Gradient'}
              value={formatGradient(fill.gradient)}
            />
          );
        }

        const color = fill.color;
        if (!color) return null;

        return (
          <InspectPropertyRow
            key={i}
            label={indexLabel ?? 'Color'}
            value={`${color.toUpperCase()}${formatOpacity(fill.opacity)}`}
            colorSwatch={color}
          />
        );
      })}
    </InspectSection>
  );
}
