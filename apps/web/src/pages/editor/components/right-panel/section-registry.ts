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
import { LayoutGuideSection } from './sections/layout-guide-section';
import { AutoLayoutSection } from './sections/auto-layout-section';
import { ImageSection } from './sections/image-section';
import { PathDataSection } from './sections/path-data-section';
import { ExportSection } from './sections/export-section';
import { PreviewSection } from './sections/preview-section';

const sectionRegistry: Record<ShapeType, PropertySection[]> = {
  rectangle: [
    TransformSection,
    AppearanceSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  ellipse: [
    TransformSection,
    AppearanceSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  frame: [
    TransformSection,
    AppearanceSection,
    AutoLayoutSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    LayoutGuideSection,
    ExportSection,
    PreviewSection,
  ],
  text: [
    TransformSection,
    AppearanceSection,
    FillSection,
    TypographySection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  path: [
    TransformSection,
    AppearanceSection,
    PathDataSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  group: [TransformSection, AppearanceSection, EffectsSection, ExportSection, PreviewSection],
  line: [
    TransformSection,
    AppearanceSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  polygon: [
    TransformSection,
    AppearanceSection,
    FillSection,
    StrokeSection,
    SidesSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  star: [
    TransformSection,
    AppearanceSection,
    FillSection,
    StrokeSection,
    StarSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  arrow: [
    TransformSection,
    AppearanceSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  image: [
    TransformSection,
    AppearanceSection,
    ImageSection,
    FillSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  svg: [TransformSection, AppearanceSection, EffectsSection, ExportSection, PreviewSection],
};

export function getSectionsForShape(shapeType: ShapeType): PropertySection[] {
  return sectionRegistry[shapeType] ?? [TransformSection];
}
