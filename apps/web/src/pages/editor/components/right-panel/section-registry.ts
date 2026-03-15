import type { ShapeType } from '@draftila/shared';
import type { PropertySection } from './types';
import { TransformSection } from './sections/transform-section';
import { AppearanceSection } from './sections/appearance-section';
import { FillSection } from './sections/fill-section';
import { StrokeSection } from './sections/stroke-section';
import { SidesSection } from './sections/sides-section';
import { StarSection } from './sections/star-section';
import { TypographySection } from './sections/typography-section';
import { EffectsSection } from './sections/effects-section';

const sectionRegistry: Record<ShapeType, PropertySection[]> = {
  rectangle: [TransformSection, AppearanceSection, FillSection, StrokeSection, EffectsSection],
  ellipse: [TransformSection, AppearanceSection, FillSection, StrokeSection, EffectsSection],
  frame: [TransformSection, AppearanceSection, FillSection, StrokeSection, EffectsSection],
  text: [TransformSection, AppearanceSection, FillSection, TypographySection, EffectsSection],
  path: [TransformSection, AppearanceSection, FillSection, StrokeSection, EffectsSection],
  group: [TransformSection, AppearanceSection, EffectsSection],
  line: [TransformSection, AppearanceSection, StrokeSection, EffectsSection],
  polygon: [
    TransformSection,
    AppearanceSection,
    FillSection,
    StrokeSection,
    SidesSection,
    EffectsSection,
  ],
  star: [
    TransformSection,
    AppearanceSection,
    FillSection,
    StrokeSection,
    StarSection,
    EffectsSection,
  ],
  arrow: [TransformSection, AppearanceSection, StrokeSection, EffectsSection],
  image: [TransformSection, AppearanceSection, FillSection, EffectsSection],
};

export function getSectionsForShape(shapeType: ShapeType): PropertySection[] {
  return sectionRegistry[shapeType] ?? [TransformSection];
}
