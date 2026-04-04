import type { EditorMode, ShapeType } from '@draftila/shared';
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
import { ConstraintsSection } from './sections/constraints-section';
import { BrushSettingsSection } from './sections/brush-settings-section';
import { ExportSection } from './sections/export-section';
import { PreviewSection } from './sections/preview-section';

const sectionRegistry: Record<ShapeType, PropertySection[]> = {
  rectangle: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  ellipse: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  frame: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
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
    ConstraintsSection,
    FillSection,
    TypographySection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  path: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    PathDataSection,
    BrushSettingsSection,
    FillSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  group: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  line: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    StrokeSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  polygon: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
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
    ConstraintsSection,
    FillSection,
    StrokeSection,
    StarSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],

  image: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    ImageSection,
    FillSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
  svg: [
    TransformSection,
    AppearanceSection,
    ConstraintsSection,
    EffectsSection,
    ExportSection,
    PreviewSection,
  ],
};

const DRAW_MODE_EXCLUDED: PropertySection[] = [AutoLayoutSection, ConstraintsSection];

export function getSectionsForShape(
  shapeType: ShapeType,
  editorMode: EditorMode = 'design',
): PropertySection[] {
  const sections = sectionRegistry[shapeType] ?? [TransformSection];
  if (editorMode === 'draw') {
    return sections.filter((s) => !DRAW_MODE_EXCLUDED.includes(s));
  }
  return sections;
}

const MULTI_SELECT_EXCLUDED: PropertySection[] = [
  TransformSection,
  ConstraintsSection,
  AutoLayoutSection,
  LayoutGuideSection,
  SidesSection,
  StarSection,
  TypographySection,
  ImageSection,
  PathDataSection,
  BrushSettingsSection,
  ExportSection,
  PreviewSection,
];

export function getSectionsForMultiSelection(shapeTypes: ShapeType[]): PropertySection[] {
  if (shapeTypes.length === 0) return [];
  const sectionSets = shapeTypes.map(
    (type) => new Set(sectionRegistry[type] ?? [TransformSection]),
  );
  const first = sectionRegistry[shapeTypes[0]!] ?? [TransformSection];
  return first.filter(
    (section) =>
      !MULTI_SELECT_EXCLUDED.includes(section) && sectionSets.every((set) => set.has(section)),
  );
}
