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
  strokeSchema,
  shadowSchema,
  blurSchema,
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
export type Stroke = z.infer<typeof strokeSchema>;
export type Shadow = z.infer<typeof shadowSchema>;
export type Blur = z.infer<typeof blurSchema>;

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
