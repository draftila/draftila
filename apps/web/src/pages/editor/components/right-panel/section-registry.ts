import type { ShapeType } from '@draftila/shared';
import type { PropertySection } from './types';
import { TransformSection } from './sections/transform-section';
import { AppearanceSection } from './sections/appearance-section';
import { FillSection } from './sections/fill-section';
import { StrokeSection } from './sections/stroke-section';
import { SidesSection } from './sections/sides-section';
import { StarSection } from './sections/star-section';
import { TypographySection } from './sections/typography-section';

const sectionRegistry: Record<ShapeType, PropertySection[]> = {
  rectangle: [TransformSection, AppearanceSection, FillSection, StrokeSection],
  ellipse: [TransformSection, AppearanceSection, FillSection, StrokeSection],
  frame: [TransformSection, AppearanceSection, FillSection, StrokeSection],
  text: [TransformSection, AppearanceSection, FillSection, TypographySection],
  path: [TransformSection, AppearanceSection, FillSection, StrokeSection],
  group: [TransformSection, AppearanceSection],
  line: [TransformSection, AppearanceSection, StrokeSection],
  polygon: [TransformSection, AppearanceSection, FillSection, StrokeSection, SidesSection],
  star: [TransformSection, AppearanceSection, FillSection, StrokeSection, StarSection],
  arrow: [TransformSection, AppearanceSection, StrokeSection],
  image: [TransformSection, AppearanceSection, FillSection],
};

export function getSectionsForShape(shapeType: ShapeType): PropertySection[] {
  return sectionRegistry[shapeType] ?? [TransformSection];
}
