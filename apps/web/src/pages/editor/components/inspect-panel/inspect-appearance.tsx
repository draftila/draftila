import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type ShapeWithCornerRadius = Shape & {
  cornerRadius?: number;
  cornerRadiusTL?: number;
  cornerRadiusTR?: number;
  cornerRadiusBL?: number;
  cornerRadiusBR?: number;
  cornerSmoothing?: number;
  clip?: boolean;
};

function formatCornerRadius(shape: ShapeWithCornerRadius): string | null {
  const tl = shape.cornerRadiusTL ?? shape.cornerRadius ?? 0;
  const tr = shape.cornerRadiusTR ?? shape.cornerRadius ?? 0;
  const bl = shape.cornerRadiusBL ?? shape.cornerRadius ?? 0;
  const br = shape.cornerRadiusBR ?? shape.cornerRadius ?? 0;
  if (tl === 0 && tr === 0 && bl === 0 && br === 0) return null;
  if (tl === tr && tr === bl && bl === br) return `${tl}`;
  return `${tl} ${tr} ${br} ${bl}`;
}

export function InspectAppearance({ shape }: { shape: Shape }) {
  const radius = formatCornerRadius(shape as ShapeWithCornerRadius);
  const showOpacity = shape.opacity !== 1;
  const showBlendMode = shape.blendMode !== 'normal';
  const showClip = shape.type === 'frame' && 'clip' in shape;

  if (!showOpacity && !showBlendMode && !radius && !showClip) return null;

  return (
    <InspectSection title="Appearance">
      {showOpacity && (
        <InspectPropertyRow label="Opacity" value={`${Math.round(shape.opacity * 100)}%`} />
      )}
      {showBlendMode && <InspectPropertyRow label="Blend Mode" value={shape.blendMode} />}
      {radius && <InspectPropertyRow label="Radius" value={radius} />}
      {showClip && (
        <InspectPropertyRow
          label="Clip Content"
          value={(shape as ShapeWithCornerRadius).clip ? 'Yes' : 'No'}
        />
      )}
    </InspectSection>
  );
}
