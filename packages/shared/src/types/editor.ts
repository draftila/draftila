import type { z } from 'zod';
import type {
  shapeTypeSchema,
  toolTypeSchema,
  pointSchema,
  pressurePointSchema,
  baseShapeSchema,
  rectangleShapeSchema,
  ellipseShapeSchema,
  frameShapeSchema,
  textShapeSchema,
  pathShapeSchema,
  lineShapeSchema,
  polygonShapeSchema,
  starShapeSchema,
  arrowShapeSchema,
  imageShapeSchema,
  groupShapeSchema,
  shapeSchema,
  fillSchema,
  gradientStopSchema,
  gradientSchema,
  strokeSchema,
  strokeCapSchema,
  strokeJoinSchema,
  strokeAlignSchema,
  strokeDashPatternSchema,
  strokeSidesSchema,
  shadowSchema,
  blurSchema,
  textSegmentSchema,
  layoutGuideSchema,
  layoutDirectionSchema,
  layoutAlignSchema,
  layoutJustifySchema,
  sizingModeSchema,
} from '../schemas/editor';

export type ShapeType = z.infer<typeof shapeTypeSchema>;
export type ToolType = z.infer<typeof toolTypeSchema>;
export type Point = z.infer<typeof pointSchema>;
export type PressurePoint = z.infer<typeof pressurePointSchema>;
export type BaseShape = z.infer<typeof baseShapeSchema>;
export type RectangleShape = z.infer<typeof rectangleShapeSchema>;
export type EllipseShape = z.infer<typeof ellipseShapeSchema>;
export type FrameShape = z.infer<typeof frameShapeSchema>;
export type TextShape = z.infer<typeof textShapeSchema>;
export type PathShape = z.infer<typeof pathShapeSchema>;
export type LineShape = z.infer<typeof lineShapeSchema>;
export type PolygonShape = z.infer<typeof polygonShapeSchema>;
export type StarShape = z.infer<typeof starShapeSchema>;
export type ArrowShape = z.infer<typeof arrowShapeSchema>;
export type ImageShape = z.infer<typeof imageShapeSchema>;
export type GroupShape = z.infer<typeof groupShapeSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type Fill = z.infer<typeof fillSchema>;
export type GradientStop = z.infer<typeof gradientStopSchema>;
export type Gradient = z.infer<typeof gradientSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type StrokeCap = z.infer<typeof strokeCapSchema>;
export type StrokeJoin = z.infer<typeof strokeJoinSchema>;
export type StrokeAlign = z.infer<typeof strokeAlignSchema>;
export type StrokeDashPattern = z.infer<typeof strokeDashPatternSchema>;
export type StrokeSides = z.infer<typeof strokeSidesSchema>;
export type Shadow = z.infer<typeof shadowSchema>;
export type Blur = z.infer<typeof blurSchema>;
export type TextSegment = z.infer<typeof textSegmentSchema>;
export type LayoutGuide = z.infer<typeof layoutGuideSchema>;
export type LayoutDirection = z.infer<typeof layoutDirectionSchema>;
export type LayoutAlign = z.infer<typeof layoutAlignSchema>;
export type LayoutJustify = z.infer<typeof layoutJustifySchema>;
export type SizingMode = z.infer<typeof sizingModeSchema>;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface AwarenessState {
  user: { id: string; name: string; color: string };
  cursor: Point | null;
  selectedIds: string[];
  activeTool: ToolType;
}
