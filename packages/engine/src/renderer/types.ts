import type {
  Blur,
  Camera,
  Fill,
  LayoutGuide,
  Shadow,
  Stroke,
  TextSegment,
  Viewport,
} from '@draftila/shared';

export interface RenderStyle {
  fills: Fill[];
  strokes: Stroke[];
  shadows: Shadow[];
  blurs: Blur[];
  opacity: number;
  blendMode?: string;
}

export interface RenderTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextRenderOptions {
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  textDecoration: 'none' | 'underline' | 'strikethrough';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textTruncation?: 'none' | 'ending';
  fills: Fill[];
  segments?: TextSegment[];
  shadows: Shadow[];
  blurs: Blur[];
}

export interface ImageRenderOptions {
  src: string;
  fit: 'fill' | 'fit' | 'crop';
  cropX?: number;
  cropY?: number;
  opacity: number;
  shadows: Shadow[];
  blurs: Blur[];
}

export function solidFill(color: string, opacity = 1): Fill {
  return { color, opacity, visible: true };
}

export function solidStroke(color: string, width = 1, opacity = 1): Stroke {
  return {
    color,
    width,
    opacity,
    visible: true,
    cap: 'butt',
    join: 'miter',
    align: 'inside',
    dashPattern: 'solid',
    dashOffset: 0,
    miterLimit: 4,
  };
}

export function simpleStyle(options: {
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  opacity?: number;
}): RenderStyle {
  const fills: Fill[] = options.fill ? [solidFill(options.fill)] : [];
  const strokes: Stroke[] =
    options.stroke && (options.strokeWidth ?? 1) > 0
      ? [solidStroke(options.stroke, options.strokeWidth ?? 1)]
      : [];
  return { fills, strokes, shadows: [], blurs: [], opacity: options.opacity ?? 1 };
}

export interface Renderer {
  readonly width: number;
  readonly height: number;

  resize(width: number, height: number, dpr: number): void;
  clear(): void;
  fillBackground(color: string): void;

  save(): void;
  restore(): void;

  applyCamera(camera: Camera): void;
  getViewport(camera: Camera): Viewport;

  drawPixelGrid(viewport: Viewport, zoom: number): void;

  drawRect(
    transform: RenderTransform,
    style: RenderStyle,
    cornerRadius: number | [number, number, number, number],
  ): void;

  drawEllipse(transform: RenderTransform, style: RenderStyle): void;

  drawPath(points: Array<[number, number]>, style: RenderStyle, closed?: boolean): void;

  drawSvgPath(
    transform: RenderTransform,
    pathData: string,
    style: RenderStyle,
    fillRule?: 'nonzero' | 'evenodd',
  ): void;

  drawText(transform: RenderTransform, options: TextRenderOptions): void;

  drawImage(transform: RenderTransform, options: ImageRenderOptions): void;

  beginClip(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation?: number,
    cornerRadius?: number | [number, number, number, number],
  ): void;

  endClip(): void;

  drawSelectionBox(
    x: number,
    y: number,
    width: number,
    height: number,
    zoom: number,
    rotation?: number,
  ): void;

  drawHoverOutline(
    x: number,
    y: number,
    width: number,
    height: number,
    zoom: number,
    rotation?: number,
  ): void;

  drawMarquee(x: number, y: number, width: number, height: number, zoom: number): void;

  drawHandle(x: number, y: number, zoom: number): void;

  drawRotationHandle(x: number, y: number, zoom: number): void;

  drawSnapLine(axis: 'x' | 'y', position: number, start: number, end: number, zoom: number): void;

  drawDistanceIndicator(
    axis: 'x' | 'y',
    from: number,
    to: number,
    position: number,
    zoom: number,
  ): void;

  drawSizeLabel(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    zoom: number,
  ): void;

  drawFrameLabel(x: number, y: number, name: string, zoom: number, selected: boolean): void;

  drawLayoutGuides(transform: RenderTransform, guides: LayoutGuide[]): void;

  drawPathNode(x: number, y: number, zoom: number, selected: boolean): void;

  drawBezierHandle(x: number, y: number, zoom: number): void;

  drawControlLine(x1: number, y1: number, x2: number, y2: number, zoom: number): void;

  measureText(
    content: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
  ): { width: number; height: number };

  measureFrameLabel(name: string, zoom: number): { width: number; height: number };
}
