import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

export function InspectConstraints({ shape }: { shape: Shape }) {
  const showH = shape.constraintHorizontal !== 'left';
  const showV = shape.constraintVertical !== 'top';
  const showSizingH = shape.layoutSizingHorizontal !== 'fixed';
  const showSizingV = shape.layoutSizingVertical !== 'fixed';

  if (!showH && !showV && !showSizingH && !showSizingV) return null;

  return (
    <InspectSection title="Constraints" defaultOpen={false}>
      {showH && <InspectPropertyRow label="Horizontal" value={shape.constraintHorizontal} />}
      {showV && <InspectPropertyRow label="Vertical" value={shape.constraintVertical} />}
      {showSizingH && (
        <InspectPropertyRow label="Width Sizing" value={shape.layoutSizingHorizontal} />
      )}
      {showSizingV && (
        <InspectPropertyRow label="Height Sizing" value={shape.layoutSizingVertical} />
      )}
    </InspectSection>
  );
}
