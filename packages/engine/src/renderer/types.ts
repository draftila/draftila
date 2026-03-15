import type { Camera, Viewport } from '@draftila/shared';

export interface RenderStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
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
  fill: string | null;
}

export interface Renderer {
  readonly width: number;
  readonly height: number;

  resize(width: number, height: number, dpr: number): void;
  clear(): void;

  save(): void;
  restore(): void;

  applyCamera(camera: Camera): void;
  getViewport(camera: Camera): Viewport;

  drawRect(transform: RenderTransform, style: RenderStyle, cornerRadius: number): void;

  drawEllipse(transform: RenderTransform, style: RenderStyle): void;

  drawPath(points: Array<[number, number]>, style: RenderStyle, closed?: boolean): void;

  drawText(transform: RenderTransform, options: TextRenderOptions): void;

  drawSelectionBox(x: number, y: number, width: number, height: number, rotation?: number): void;

  drawMarquee(x: number, y: number, width: number, height: number): void;

  drawHandle(x: number, y: number, zoom: number): void;

  drawRotationHandle(x: number, y: number, zoom: number): void;

  drawSnapLine(axis: 'x' | 'y', position: number, viewportSize: number): void;

  measureText(
    content: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
  ): { width: number; height: number };
}
