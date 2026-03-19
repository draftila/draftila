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
  'image',
  'svg',
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
  'pencil',
  'node',
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

export const vectorNodeSchema = z.object({
  x: z.number(),
  y: z.number(),
  handleInX: z.number().default(0),
  handleInY: z.number().default(0),
  handleOutX: z.number().default(0),
  handleOutY: z.number().default(0),
  type: z.enum(['corner', 'smooth', 'symmetric']).default('corner'),
});

export const subpathSchema = z.object({
  nodes: z.array(vectorNodeSchema),
  closed: z.boolean().default(true),
});

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6,8}$/);

export const gradientStopSchema = z.object({
  color: colorSchema,
  position: z.number().min(0).max(1),
});

export const linearGradientSchema = z.object({
  type: z.literal('linear'),
  angle: z.number().default(0),
  stops: z.array(gradientStopSchema).min(2),
});

export const radialGradientSchema = z.object({
  type: z.literal('radial'),
  cx: z.number().min(0).max(1).default(0.5),
  cy: z.number().min(0).max(1).default(0.5),
  r: z.number().min(0).default(0.5),
  stops: z.array(gradientStopSchema).min(2),
});

export const gradientSchema = z.discriminatedUnion('type', [
  linearGradientSchema,
  radialGradientSchema,
]);

export const fillSchema = z.object({
  color: colorSchema,
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  gradient: gradientSchema.optional(),
});

export const strokeCapSchema = z.enum(['butt', 'round', 'square']);
export const strokeJoinSchema = z.enum(['miter', 'round', 'bevel']);
export const strokeAlignSchema = z.enum(['center', 'inside', 'outside']);
export const strokeDashPatternSchema = z.enum(['solid', 'dash', 'dot', 'dash-dot']);

export const ARROWHEAD_TYPES = [
  'none',
  'line_arrow',
  'triangle_arrow',
  'reversed_triangle',
  'circle_arrow',
  'diamond_arrow',
] as const;

export const arrowheadTypeSchema = z.enum(ARROWHEAD_TYPES);

export const strokeSidesSchema = z.object({
  top: z.boolean().default(true),
  right: z.boolean().default(true),
  bottom: z.boolean().default(true),
  left: z.boolean().default(true),
});

export const strokeSchema = z.object({
  color: colorSchema,
  width: z.number().min(0).default(1),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  cap: strokeCapSchema.default('butt'),
  join: strokeJoinSchema.default('miter'),
  align: strokeAlignSchema.default('center'),
  dashPattern: strokeDashPatternSchema.default('solid'),
  dashArray: z.array(z.number()).optional(),
  dashOffset: z.number().default(0),
  miterLimit: z.number().min(0).default(4),
  sides: strokeSidesSchema.optional(),
});

export const shadowSchema = z.object({
  type: z.enum(['drop', 'inner']),
  x: z.number().default(0),
  y: z.number().default(4),
  blur: z.number().default(8),
  spread: z.number().default(0),
  color: colorSchema.default('#00000040'),
  visible: z.boolean().default(true),
});

export const blurSchema = z.object({
  type: z.enum(['layer', 'background']),
  radius: z.number().default(4),
  visible: z.boolean().default(true),
});

export const layoutGuideSchema = z.object({
  type: z.enum(['grid', 'columns', 'rows']),
  size: z.number().min(1).default(10),
  color: colorSchema.default('#FF000019'),
  visible: z.boolean().default(true),
});

export const textSegmentSchema = z.object({
  text: z.string(),
  color: colorSchema.optional(),
  fontSize: z.number().min(1).optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.number().optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textDecoration: z.enum(['none', 'underline', 'strikethrough']).optional(),
  letterSpacing: z.number().optional(),
  gradient: gradientSchema.optional(),
});

export const layoutDirectionSchema = z.enum(['none', 'horizontal', 'vertical']);
export const layoutAlignSchema = z.enum(['start', 'center', 'end', 'stretch']);
export const layoutJustifySchema = z.enum([
  'start',
  'center',
  'end',
  'space_between',
  'space_around',
]);
export const sizingModeSchema = z.enum(['fixed', 'hug', 'fill']);
export const horizontalConstraintSchema = z.enum([
  'left',
  'right',
  'left-right',
  'center',
  'scale',
]);
export const verticalConstraintSchema = z.enum(['top', 'bottom', 'top-bottom', 'center', 'scale']);

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
  layoutSizingHorizontal: sizingModeSchema.default('fixed'),
  layoutSizingVertical: sizingModeSchema.default('fixed'),
  constraintHorizontal: horizontalConstraintSchema.default('left'),
  constraintVertical: verticalConstraintSchema.default('top'),
});

export const rectangleShapeSchema = baseShapeSchema.extend({
  type: z.literal('rectangle'),
  fills: z.array(fillSchema).default([{ color: '#D9D9D9', opacity: 1, visible: true }]),
  strokes: z.array(strokeSchema).default([]),
  cornerRadius: z.number().min(0).default(0),
  cornerRadiusTL: z.number().min(0).optional(),
  cornerRadiusTR: z.number().min(0).optional(),
  cornerRadiusBL: z.number().min(0).optional(),
  cornerRadiusBR: z.number().min(0).optional(),
  cornerSmoothing: z.number().min(0).max(1).default(0),
  svgPathData: z.string().optional(),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const ellipseShapeSchema = baseShapeSchema.extend({
  type: z.literal('ellipse'),
  fills: z.array(fillSchema).default([{ color: '#D9D9D9', opacity: 1, visible: true }]),
  strokes: z.array(strokeSchema).default([]),
  svgPathData: z.string().optional(),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const frameShapeSchema = baseShapeSchema.extend({
  type: z.literal('frame'),
  fills: z.array(fillSchema).default([{ color: '#FFFFFF', opacity: 1, visible: true }]),
  strokes: z.array(strokeSchema).default([]),
  clip: z.boolean().default(true),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
  guides: z.array(layoutGuideSchema).default([]),
  layoutMode: layoutDirectionSchema.default('none'),
  layoutGap: z.number().min(0).default(0),
  paddingTop: z.number().min(0).default(0),
  paddingRight: z.number().min(0).default(0),
  paddingBottom: z.number().min(0).default(0),
  paddingLeft: z.number().min(0).default(0),
  layoutAlign: layoutAlignSchema.default('start'),
  layoutJustify: layoutJustifySchema.default('start'),
  layoutSizingHorizontal: sizingModeSchema.default('fixed'),
  layoutSizingVertical: sizingModeSchema.default('fixed'),
});

export const textAutoResizeSchema = z.enum(['none', 'width', 'height']);

export const textShapeSchema = baseShapeSchema.extend({
  type: z.literal('text'),
  content: z.string().default(''),
  textAutoResize: textAutoResizeSchema.default('none'),
  fontSize: z.number().min(1).default(16),
  fontFamily: z.string().default('Inter'),
  fontWeight: z.number().default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('middle'),
  lineHeight: z.number().min(0).default(1.2),
  letterSpacing: z.number().default(0),
  textDecoration: z.enum(['none', 'underline', 'strikethrough']).default('none'),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).default('none'),
  fills: z.array(fillSchema).default([{ color: '#000000', opacity: 1, visible: true }]),
  segments: z.array(textSegmentSchema).optional(),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const pathShapeSchema = baseShapeSchema.extend({
  type: z.literal('path'),
  points: z.array(pressurePointSchema).default([]),
  svgPathData: z.string().optional(),
  vectorNodes: z.array(subpathSchema).optional(),
  fillRule: z.enum(['nonzero', 'evenodd']).default('nonzero'),
  fills: z.array(fillSchema).default([{ color: '#000000', opacity: 1, visible: true }]),
  strokes: z.array(strokeSchema).default([]),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const lineShapeSchema = baseShapeSchema.extend({
  type: z.literal('line'),
  x1: z.number().default(0),
  y1: z.number().default(0),
  x2: z.number().default(100),
  y2: z.number().default(0),
  strokes: z
    .array(strokeSchema)
    .default([{ color: '#000000', width: 2, opacity: 1, visible: true }]),
  startArrowhead: arrowheadTypeSchema.default('none'),
  endArrowhead: arrowheadTypeSchema.default('none'),
  svgPathData: z.string().optional(),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const polygonShapeSchema = baseShapeSchema.extend({
  type: z.literal('polygon'),
  sides: z.number().min(3).default(6),
  fills: z.array(fillSchema).default([{ color: '#D9D9D9', opacity: 1, visible: true }]),
  strokes: z.array(strokeSchema).default([]),
  svgPathData: z.string().optional(),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const starShapeSchema = baseShapeSchema.extend({
  type: z.literal('star'),
  points: z.number().min(3).default(5),
  innerRadius: z.number().min(0).max(1).default(0.38),
  fills: z.array(fillSchema).default([{ color: '#D9D9D9', opacity: 1, visible: true }]),
  strokes: z.array(strokeSchema).default([]),
  svgPathData: z.string().optional(),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const imageShapeSchema = baseShapeSchema.extend({
  type: z.literal('image'),
  src: z.string().default(''),
  fit: z.enum(['fill', 'fit', 'crop']).default('fill'),
  cropX: z.number().min(0).max(1).default(0.5),
  cropY: z.number().min(0).max(1).default(0.5),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const svgShapeSchema = baseShapeSchema.extend({
  type: z.literal('svg'),
  svgContent: z.string().default(''),
  preserveAspectRatio: z.string().default('xMidYMid meet'),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
});

export const groupShapeSchema = baseShapeSchema.extend({
  type: z.literal('group'),
  shadows: z.array(shadowSchema).default([]),
  blurs: z.array(blurSchema).default([]),
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
  imageShapeSchema,
  svgShapeSchema,
  groupShapeSchema,
]);
