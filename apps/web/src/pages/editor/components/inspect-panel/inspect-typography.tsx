import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type TextShape = Shape & {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: string;
  textAlign: string;
  verticalAlign: string;
  lineHeight: number;
  letterSpacing: number;
  textDecoration: string;
  textTransform: string;
};

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

export function InspectTypography({ shape }: { shape: Shape }) {
  if (shape.type !== 'text') return null;
  const text = shape as TextShape;

  return (
    <InspectSection title="Typography">
      <InspectPropertyRow label="Font" value={text.fontFamily} />
      <InspectPropertyRow
        label="Weight"
        value={WEIGHT_NAMES[text.fontWeight] ?? String(text.fontWeight)}
      />
      <InspectPropertyRow label="Size" value={`${text.fontSize}`} />
      <InspectPropertyRow label="Line Height" value={`${text.lineHeight}`} />
      {text.letterSpacing !== 0 && (
        <InspectPropertyRow label="Letter Spacing" value={`${text.letterSpacing}`} />
      )}
      <InspectPropertyRow label="Align" value={text.textAlign} />
      {text.fontStyle !== 'normal' && <InspectPropertyRow label="Style" value={text.fontStyle} />}
      {text.textDecoration !== 'none' && (
        <InspectPropertyRow label="Decoration" value={text.textDecoration} />
      )}
      {text.textTransform !== 'none' && (
        <InspectPropertyRow label="Transform" value={text.textTransform} />
      )}
    </InspectSection>
  );
}
