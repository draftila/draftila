import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function InspectTransform({ shape }: { shape: Shape }) {
  return (
    <InspectSection title="Transform">
      <InspectPropertyRow label="X" value={round(shape.x)} />
      <InspectPropertyRow label="Y" value={round(shape.y)} />
      <InspectPropertyRow label="W" value={round(shape.width)} />
      <InspectPropertyRow label="H" value={round(shape.height)} />
      {shape.rotation !== 0 && (
        <InspectPropertyRow label="Rotation" value={`${round(shape.rotation)}°`} />
      )}
    </InspectSection>
  );
}
