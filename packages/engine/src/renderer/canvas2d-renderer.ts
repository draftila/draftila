import type { Camera, LayoutGuide, Viewport } from '@draftila/shared';
import type {
  ImageRenderOptions,
  Renderer,
  RenderStyle,
  RenderTransform,
  TextRenderOptions,
} from './types';
import { resolveCanvasFontFamily } from '../font-manager';
import { StyleEngine } from './style-engine';
import * as shapeDraw from './shape-draw';
import * as textDraw from './text-draw';
import * as uiDraw from './ui-draw';
import * as guidesDraw from './guides-draw';

export class Canvas2DRenderer implements Renderer {
  private static imageCache = new Map<string, HTMLImageElement>();
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr = 1;
  private _width = 0;
  private _height = 0;
  private se: StyleEngine;

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;
    this.se = new StyleEngine(ctx, canvas, this.dpr, Canvas2DRenderer.imageCache);
  }

  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr;
    this._width = width;
    this._height = height;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
    this.se.updateDpr(dpr);
  }

  clear() {
    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.clearRect(0, 0, this._width, this._height);
  }

  fillBackground(color: string) {
    const { ctx } = this;
    ctx.save();
    ctx.resetTransform();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this._width, this._height);
    ctx.restore();
  }

  save() {
    this.ctx.save();
  }

  restore() {
    this.ctx.restore();
  }

  applyCamera(camera: Camera) {
    this.ctx.translate(camera.x, camera.y);
    this.ctx.scale(camera.zoom, camera.zoom);
  }

  getViewport(camera: Camera): Viewport {
    return {
      minX: -camera.x / camera.zoom,
      minY: -camera.y / camera.zoom,
      maxX: (this._width - camera.x) / camera.zoom,
      maxY: (this._height - camera.y) / camera.zoom,
    };
  }

  drawPixelGrid(viewport: Viewport, zoom: number) {
    guidesDraw.drawPixelGrid(this.ctx, viewport, zoom);
  }

  drawRect(
    transform: RenderTransform,
    style: RenderStyle,
    cornerRadius: number | [number, number, number, number],
  ) {
    shapeDraw.drawRect(this.ctx, this.se, transform, style, cornerRadius);
  }

  drawEllipse(transform: RenderTransform, style: RenderStyle) {
    shapeDraw.drawEllipse(this.ctx, this.se, transform, style);
  }

  drawPath(points: Array<[number, number]>, style: RenderStyle, closed = true) {
    shapeDraw.drawPath(this.ctx, this.se, points, style, closed);
  }

  drawSvgPath(
    transform: RenderTransform,
    pathData: string,
    style: RenderStyle,
    fillRule: 'nonzero' | 'evenodd' = 'nonzero',
  ) {
    shapeDraw.drawSvgPath(this.ctx, this.se, transform, pathData, style, fillRule);
  }

  drawText(transform: RenderTransform, options: TextRenderOptions) {
    textDraw.drawText(this.ctx, this.se, transform, options);
  }

  drawImage(transform: RenderTransform, options: ImageRenderOptions) {
    shapeDraw.drawImage(this.ctx, this.se, transform, options, (t, s, cr) =>
      this.drawRect(t, s, cr),
    );
  }

  beginClip(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
    cornerRadius: number | [number, number, number, number] = 0,
  ) {
    const { ctx } = this;
    ctx.save();
    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.translate(-cx, -cy);
    }
    ctx.beginPath();
    const hasRadius = Array.isArray(cornerRadius)
      ? cornerRadius.some((r) => r > 0)
      : cornerRadius > 0;
    if (hasRadius) {
      ctx.roundRect(x, y, width, height, cornerRadius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.clip();
  }

  endClip() {
    this.ctx.restore();
  }

  drawSelectionBox(
    x: number,
    y: number,
    width: number,
    height: number,
    zoom: number,
    rotation = 0,
  ) {
    uiDraw.drawSelectionBox(this.ctx, x, y, width, height, zoom, rotation);
  }

  drawHoverOutline(
    x: number,
    y: number,
    width: number,
    height: number,
    zoom: number,
    rotation = 0,
  ) {
    uiDraw.drawHoverOutline(this.ctx, x, y, width, height, zoom, rotation);
  }

  drawMarquee(x: number, y: number, width: number, height: number, zoom: number) {
    uiDraw.drawMarquee(this.ctx, x, y, width, height, zoom);
  }

  drawHandle(x: number, y: number, zoom: number) {
    uiDraw.drawHandle(this.ctx, x, y, zoom);
  }

  drawRotationHandle(x: number, y: number, zoom: number) {
    uiDraw.drawRotationHandle(this.ctx, x, y, zoom);
  }

  drawPathNode(x: number, y: number, zoom: number, selected: boolean) {
    uiDraw.drawPathNode(this.ctx, x, y, zoom, selected);
  }

  drawBezierHandle(x: number, y: number, zoom: number) {
    uiDraw.drawBezierHandle(this.ctx, x, y, zoom);
  }

  drawControlLine(x1: number, y1: number, x2: number, y2: number, zoom: number) {
    uiDraw.drawControlLine(this.ctx, x1, y1, x2, y2, zoom);
  }

  drawGuide(
    axis: 'x' | 'y',
    position: number,
    viewport: Viewport,
    zoom: number,
    selected: boolean,
  ) {
    guidesDraw.drawGuide(this.ctx, axis, position, viewport, zoom, selected);
  }

  drawGuidePositionLabel(axis: 'x' | 'y', position: number, zoom: number) {
    guidesDraw.drawGuidePositionLabel(this.ctx, axis, position, zoom);
  }

  drawSnapLine(axis: 'x' | 'y', position: number, start: number, end: number, zoom: number) {
    guidesDraw.drawSnapLine(this.ctx, axis, position, start, end, zoom);
  }

  drawDistanceIndicator(axis: 'x' | 'y', from: number, to: number, position: number, zoom: number) {
    guidesDraw.drawDistanceIndicator(this.ctx, axis, from, to, position, zoom);
  }

  drawSizeLabel(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    zoom: number,
  ) {
    guidesDraw.drawSizeLabel(this.ctx, x, y, width, height, rotation, zoom);
  }

  drawFrameLabel(x: number, y: number, name: string, zoom: number, selected: boolean) {
    guidesDraw.drawFrameLabel(this.ctx, x, y, name, zoom, selected);
  }

  drawLayoutGuides(transform: RenderTransform, guides: LayoutGuide[]) {
    guidesDraw.drawLayoutGuides(this.ctx, this.se, transform, guides);
  }

  measureText(
    content: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
  ): { width: number; height: number } {
    const { ctx } = this;
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${resolveCanvasFontFamily(fontFamily)}`;

    const lines = content.split('\n');
    let maxWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxWidth) maxWidth = metrics.width;
    }
    ctx.restore();

    return {
      width: maxWidth,
      height: lines.length * fontSize * 1.2,
    };
  }

  measureFrameLabel(name: string, zoom: number): { width: number; height: number } {
    return guidesDraw.measureFrameLabel(this.ctx, name, zoom);
  }

  drawShimmerOverlay(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    cornerRadius: number | [number, number, number, number],
    shimmerPhase: number,
    isLightBackground = false,
  ) {
    guidesDraw.drawShimmerOverlay(
      this.ctx,
      x,
      y,
      width,
      height,
      rotation,
      cornerRadius,
      shimmerPhase,
      isLightBackground,
    );
  }
}
