import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type ShapeWithEffects = Shape & {
  shadows?: Array<{
    type: string;
    x: number;
    y: number;
    blur: number;
    spread: number;
    color: string;
    visible: boolean;
  }>;
  blurs?: Array<{ type: string; radius: number; visible: boolean }>;
};

export function InspectEffects({ shape }: { shape: Shape }) {
  const s = shape as ShapeWithEffects;
  const visibleShadows = s.shadows?.filter((sh) => sh.visible) ?? [];
  const visibleBlurs = s.blurs?.filter((b) => b.visible) ?? [];

  if (visibleShadows.length === 0 && visibleBlurs.length === 0) return null;

  return (
    <InspectSection title="Effects">
      {visibleShadows.map((shadow, i) => (
        <div key={`shadow-${i}`} className="flex flex-col gap-0.5">
          <InspectPropertyRow
            label={shadow.type === 'inner' ? 'Inner Shadow' : 'Drop Shadow'}
            value={shadow.color.toUpperCase()}
            colorSwatch={shadow.color.slice(0, 7)}
          />
          <InspectPropertyRow label="Offset" value={`${shadow.x}, ${shadow.y}`} />
          <InspectPropertyRow label="Blur" value={`${shadow.blur}`} />
          {shadow.spread !== 0 && <InspectPropertyRow label="Spread" value={`${shadow.spread}`} />}
        </div>
      ))}
      {visibleBlurs.map((blur, i) => (
        <InspectPropertyRow
          key={`blur-${i}`}
          label={blur.type === 'background' ? 'Background Blur' : 'Layer Blur'}
          value={`${blur.radius}`}
        />
      ))}
    </InspectSection>
  );
}
