import type { ShapeType } from '@draftila/shared';
import type { PropertySection } from './types';
import { TransformSection } from './sections/transform-section';
import { FillSection } from './sections/fill-section';
import { StrokeSection } from './sections/stroke-section';
import { CornerRadiusSection } from './sections/corner-radius-section';
import { SidesSection } from './sections/sides-section';
import { StarSection } from './sections/star-section';
import { TypographySection } from './sections/typography-section';

const sectionRegistry: Record<ShapeType, PropertySection[]> = {
  rectangle: [TransformSection, FillSection, StrokeSection, CornerRadiusSection],
  ellipse: [TransformSection, FillSection, StrokeSection],
  frame: [TransformSection, FillSection, StrokeSection],
  text: [TransformSection, FillSection, TypographySection],
  path: [TransformSection, FillSection, StrokeSection],
  group: [TransformSection],
  line: [TransformSection, StrokeSection],
  polygon: [TransformSection, FillSection, StrokeSection, SidesSection],
  star: [TransformSection, FillSection, StrokeSection, StarSection],
  arrow: [TransformSection, StrokeSection],
  image: [TransformSection, FillSection],
};

export function getSectionsForShape(shapeType: ShapeType): PropertySection[] {
  return sectionRegistry[shapeType] ?? [TransformSection];
}
