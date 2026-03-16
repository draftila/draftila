export type InterchangeNodeType =
  | 'rectangle'
  | 'ellipse'
  | 'frame'
  | 'text'
  | 'path'
  | 'line'
  | 'polygon'
  | 'star'
  | 'arrow'
  | 'image'
  | 'group';

export interface InterchangeFill {
  color: string;
  opacity: number;
  visible: boolean;
}

export interface InterchangeGradientStop {
  color: string;
  position: number;
}

export interface InterchangeGradient {
  type: 'linear' | 'radial';
  stops: InterchangeGradientStop[];
  angle?: number;
  cx?: number;
  cy?: number;
  r?: number;
}

export type InterchangeStrokeCap = 'butt' | 'round' | 'square';
export type InterchangeStrokeJoin = 'miter' | 'round' | 'bevel';
export type InterchangeStrokeAlign = 'center' | 'inside' | 'outside';
export type InterchangeDashPattern = 'solid' | 'dash' | 'dot' | 'dash-dot';

export interface InterchangeStroke {
  color: string;
  width: number;
  opacity: number;
  visible: boolean;
  cap: InterchangeStrokeCap;
  join: InterchangeStrokeJoin;
  align: InterchangeStrokeAlign;
  dashPattern: InterchangeDashPattern;
  dashOffset: number;
  miterLimit: number;
}

export interface InterchangeShadow {
  type: 'drop' | 'inner';
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  visible: boolean;
}

export interface InterchangeBlur {
  type: 'layer' | 'background';
  radius: number;
  visible: boolean;
}

export interface InterchangePathPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface InterchangeClipPath {
  type: 'rect' | 'ellipse' | 'path';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  ry?: number;
  d?: string;
}

export interface InterchangeNode {
  type: InterchangeNodeType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode: string;

  fills: InterchangeFill[];
  gradients: InterchangeGradient[];
  strokes: InterchangeStroke[];
  shadows: InterchangeShadow[];
  blurs: InterchangeBlur[];

  cornerRadius?: number;
  cornerRadiusTL?: number;
  cornerRadiusTR?: number;
  cornerRadiusBL?: number;
  cornerRadiusBR?: number;
  cornerSmoothing?: number;

  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: 'none' | 'underline' | 'strikethrough';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';

  pathPoints?: InterchangePathPoint[];
  svgPathData?: string;

  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;

  sides?: number;

  starPoints?: number;
  innerRadius?: number;

  startArrowhead?: boolean;
  endArrowhead?: boolean;

  clip?: boolean;

  src?: string;
  fit?: 'fill' | 'fit' | 'crop';

  clipPath?: InterchangeClipPath;

  children: InterchangeNode[];
}

export interface InterchangeMetadata {
  source: string;
  version?: string;
  platform?: string;
}

export interface InterchangeDocument {
  nodes: InterchangeNode[];
  metadata: InterchangeMetadata;
}

export function createInterchangeNode(
  type: InterchangeNodeType,
  overrides: Partial<InterchangeNode> = {},
): InterchangeNode {
  return {
    type,
    name: '',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    fills: [],
    gradients: [],
    strokes: [],
    shadows: [],
    blurs: [],
    children: [],
    ...overrides,
  };
}

export function createInterchangeDocument(
  nodes: InterchangeNode[],
  metadata: InterchangeMetadata,
): InterchangeDocument {
  return { nodes, metadata };
}
