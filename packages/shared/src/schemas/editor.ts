import { z } from 'zod';

export const SHAPE_TYPES = [
  'rectangle',
  'ellipse',
  'frame',
  'text',
  'path',
  'group',
  'line',
  'polygon',
  'star',
  'arrow',
  'image',
] as const;

export const shapeTypeSchema = z.enum(SHAPE_TYPES);

export const TOOL_TYPES = [
  'move',
  'hand',
  'rectangle',
  'ellipse',
  'frame',
  'text',
  'pen',
  'line',
  'polygon',
  'star',
  'arrow',
] as const;

export const toolTypeSchema = z.enum(TOOL_TYPES);

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const pressurePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().min(0).max(1).default(0.5),
});

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6,8}$/);

export const fillSchema = z.object({
  type: z.enum(['solid', 'linear-gradient', 'radial-gradient']),
  color: colorSchema.optional(),
  stops: z.array(z.object({ offset: z.number(), color: colorSchema })).optional(),
  angle: z.number().optional(),
});

export const shadowSchema = z.object({
  type: z.enum(['drop', 'inner']),
  x: z.number().default(0),
  y: z.number().default(4),
  blur: z.number().default(8),
  spread: z.number().default(0),
  color: colorSchema.default('#00000040'),
});

export const blurSchema = z.object({
  type: z.enum(['layer', 'background']),
  radius: z.number().default(4),
});

export const baseShapeSchema = z.object({
  id: z.string(),
  type: shapeTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  parentId: z.string().nullable().default(null),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  name: z.string().default(''),
  blendMode: z.string().default('normal'),
});

export const rectangleShapeSchema = baseShapeSchema.extend({
  type: z.literal('rectangle'),
  fill: colorSchema.nullable().default('#D9D9D9'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
  cornerRadius: z.number().min(0).default(0),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const ellipseShapeSchema = baseShapeSchema.extend({
  type: z.literal('ellipse'),
  fill: colorSchema.nullable().default('#D9D9D9'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
  shadows: z.array(shadowSchema).default([]),
});

export const frameShapeSchema = baseShapeSchema.extend({
  type: z.literal('frame'),
  fill: colorSchema.nullable().default('#FFFFFF'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
  clip: z.boolean().default(true),
});

export const textShapeSchema = baseShapeSchema.extend({
  type: z.literal('text'),
  content: z.string().default(''),
  fontSize: z.number().min(1).default(16),
  fontFamily: z.string().default('Inter'),
  fontWeight: z.number().default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: z.number().min(0).default(1.2),
  letterSpacing: z.number().default(0),
  textDecoration: z.enum(['none', 'underline', 'strikethrough']).default('none'),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).default('none'),
  fill: colorSchema.nullable().default('#000000'),
});

export const pathShapeSchema = baseShapeSchema.extend({
  type: z.literal('path'),
  points: z.array(pressurePointSchema).default([]),
  fill: colorSchema.nullable().default('#000000'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
});

export const lineShapeSchema = baseShapeSchema.extend({
  type: z.literal('line'),
  x1: z.number().default(0),
  y1: z.number().default(0),
  x2: z.number().default(100),
  y2: z.number().default(0),
  stroke: colorSchema.nullable().default('#000000'),
  strokeWidth: z.number().min(0).default(2),
});

export const polygonShapeSchema = baseShapeSchema.extend({
  type: z.literal('polygon'),
  sides: z.number().min(3).default(6),
  fill: colorSchema.nullable().default('#D9D9D9'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
});

export const starShapeSchema = baseShapeSchema.extend({
  type: z.literal('star'),
  points: z.number().min(3).default(5),
  innerRadius: z.number().min(0).max(1).default(0.38),
  fill: colorSchema.nullable().default('#D9D9D9'),
  stroke: colorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
});

export const arrowShapeSchema = baseShapeSchema.extend({
  type: z.literal('arrow'),
  x1: z.number().default(0),
  y1: z.number().default(0),
  x2: z.number().default(100),
  y2: z.number().default(0),
  stroke: colorSchema.nullable().default('#000000'),
  strokeWidth: z.number().min(0).default(2),
  startArrowhead: z.boolean().default(false),
  endArrowhead: z.boolean().default(true),
});

export const imageShapeSchema = baseShapeSchema.extend({
  type: z.literal('image'),
  src: z.string().default(''),
  fit: z.enum(['fill', 'fit', 'crop']).default('fill'),
});

export const groupShapeSchema = baseShapeSchema.extend({
  type: z.literal('group'),
});

export const shapeSchema = z.discriminatedUnion('type', [
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
]);
