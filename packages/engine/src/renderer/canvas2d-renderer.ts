import type { Camera, StrokeDashPattern, Viewport } from '@draftila/shared';
import type { Renderer, RenderStyle, RenderTransform, TextRenderOptions } from './types';

const SELECTION_COLOR = '#0D99FF';
const SELECTION_WIDTH = 1.5;
const MARQUEE_FILL = 'rgba(13, 153, 255, 0.08)';
const MARQUEE_STROKE = 'rgba(13, 153, 255, 0.5)';

function applyTextTransform(
  text: string,
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize',
): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const result: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      result.push('');
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        result.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) result.push(currentLine);
  }
  if (result.length === 0) result.push('');
  return result;
}

function dashPatternToArray(pattern: StrokeDashPattern, strokeWidth: number): number[] {
  switch (pattern) {
    case 'dash':
      return [strokeWidth * 4, strokeWidth * 2];
    case 'dot':
      return [strokeWidth, strokeWidth * 2];
    case 'dash-dot':
      return [strokeWidth * 4, strokeWidth * 2, strokeWidth, strokeWidth * 2];
    default:
      return [];
  }
}

function colorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  if (opacity <= 0) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export class Canvas2DRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr = 1;
  private _width = 0;
  private _height = 0;

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
  }

  clear() {
    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.clearRect(0, 0, this._width, this._height);
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

  drawRect(
    transform: RenderTransform,
    style: RenderStyle,
    cornerRadius: number | [number, number, number, number],
  ) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);
    ctx.globalAlpha = style.opacity;

    const hasRadius = Array.isArray(cornerRadius)
      ? cornerRadius.some((r) => r > 0)
      : cornerRadius > 0;

    if (hasRadius) {
      ctx.beginPath();
      ctx.roundRect(0, 0, transform.width, transform.height, cornerRadius);
      this.applyFillStroke(style);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, transform.width, transform.height);
      this.applyFillStroke(style);
      ctx.closePath();
    }

    ctx.restore();
  }

  drawEllipse(transform: RenderTransform, style: RenderStyle) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);
    ctx.globalAlpha = style.opacity;

    const cx = transform.width / 2;
    const cy = transform.height / 2;
    const rx = transform.width / 2;
    const ry = transform.height / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.applyFillStroke(style);
    ctx.closePath();

    ctx.restore();
  }

  drawPath(points: Array<[number, number]>, style: RenderStyle, closed = true) {
    const { ctx } = this;
    if (points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = style.opacity;

    const path = new Path2D();
    const [firstPoint] = points;
    if (!firstPoint) return;
    path.moveTo(firstPoint[0], firstPoint[1]);

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      if (!point) continue;
      path.lineTo(point[0], point[1]);
    }
    if (closed) {
      path.closePath();
    }

    for (const fill of style.fills) {
      if (!fill.visible) continue;
      ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);
      ctx.fill(path);
    }
    for (const stroke of style.strokes) {
      if (!stroke.visible || stroke.width <= 0) continue;
      ctx.strokeStyle = colorWithOpacity(stroke.color, stroke.opacity);
      ctx.lineWidth = stroke.width;
      ctx.lineCap = stroke.cap ?? 'round';
      ctx.lineJoin = stroke.join ?? 'round';
      ctx.miterLimit = stroke.miterLimit ?? 4;
      ctx.setLineDash(dashPatternToArray(stroke.dashPattern ?? 'solid', stroke.width));
      ctx.lineDashOffset = stroke.dashOffset ?? 0;
      ctx.stroke(path);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  drawText(transform: RenderTransform, options: TextRenderOptions) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);

    const fontStyle = options.fontStyle === 'italic' ? 'italic' : '';
    ctx.font =
      `${fontStyle} ${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`.trim();
    ctx.textAlign = options.textAlign;
    ctx.textBaseline = 'top';

    const visibleFill = options.fills.find((f) => f.visible);
    const fillColor = visibleFill ? colorWithOpacity(visibleFill.color, visibleFill.opacity) : null;

    if (fillColor) {
      ctx.fillStyle = fillColor;
    }

    const content = applyTextTransform(options.content, options.textTransform);
    const lines = wrapText(ctx, content, transform.width);
    const lineHeight = options.fontSize * options.lineHeight;
    const totalTextHeight = lines.length * lineHeight;

    let offsetY = 0;
    if (options.verticalAlign === 'middle') {
      offsetY = (transform.height - totalTextHeight) / 2;
    } else if (options.verticalAlign === 'bottom') {
      offsetY = transform.height - totalTextHeight;
    }

    let textX = 0;
    if (options.textAlign === 'center') textX = transform.width / 2;
    else if (options.textAlign === 'right') textX = transform.width;

    if (options.letterSpacing !== 0) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${options.letterSpacing}px`;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const y = offsetY + i * lineHeight;
      if (fillColor) {
        ctx.fillText(line, textX, y);
      }

      if (options.textDecoration !== 'none') {
        const metrics = ctx.measureText(line);
        let lineStartX = textX;
        if (options.textAlign === 'center') lineStartX = textX - metrics.width / 2;
        else if (options.textAlign === 'right') lineStartX = textX - metrics.width;
        const decoY =
          options.textDecoration === 'strikethrough'
            ? y + options.fontSize * 0.55
            : y + options.fontSize * 0.95;
        ctx.beginPath();
        ctx.strokeStyle = fillColor ?? '#000000';
        ctx.lineWidth = Math.max(1, options.fontSize / 16);
        ctx.moveTo(lineStartX, decoY);
        ctx.lineTo(lineStartX + metrics.width, decoY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  drawSelectionBox(x: number, y: number, width: number, height: number, rotation = 0) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = SELECTION_WIDTH / this.dpr;
    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
    } else {
      ctx.strokeRect(x, y, width, height);
    }
    ctx.restore();
  }

  drawMarquee(x: number, y: number, width: number, height: number) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = MARQUEE_FILL;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = MARQUEE_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  drawHandle(x: number, y: number, zoom: number) {
    const { ctx } = this;
    const size = 8 / zoom;
    const half = size / 2;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.fillRect(x - half, y - half, size, size);
    ctx.strokeRect(x - half, y - half, size, size);
    ctx.restore();
  }

  drawRotationHandle(x: number, y: number, zoom: number) {
    const { ctx } = this;
    const radius = 4 / zoom;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  drawSnapLine(axis: 'x' | 'y', position: number, _viewportSize: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (axis === 'x') {
      ctx.moveTo(position, -100000);
      ctx.lineTo(position, 100000);
    } else {
      ctx.moveTo(-100000, position);
      ctx.lineTo(100000, position);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  measureText(
    content: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number,
  ): { width: number; height: number } {
    const { ctx } = this;
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

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

  private applyTransform(transform: RenderTransform) {
    const { ctx } = this;
    if (transform.rotation !== 0) {
      const cx = transform.x + transform.width / 2;
      const cy = transform.y + transform.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.translate(-transform.width / 2, -transform.height / 2);
    } else {
      ctx.translate(transform.x, transform.y);
    }
  }

  private applyFillStroke(style: RenderStyle) {
    const { ctx } = this;
    for (const fill of style.fills) {
      if (!fill.visible) continue;
      ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);
      ctx.fill();
    }
    for (const stroke of style.strokes) {
      if (!stroke.visible || stroke.width <= 0) continue;
      ctx.strokeStyle = colorWithOpacity(stroke.color, stroke.opacity);
      ctx.lineWidth = stroke.width;
      ctx.lineCap = stroke.cap ?? 'butt';
      ctx.lineJoin = stroke.join ?? 'miter';
      ctx.miterLimit = stroke.miterLimit ?? 4;
      ctx.setLineDash(dashPatternToArray(stroke.dashPattern ?? 'solid', stroke.width));
      ctx.lineDashOffset = stroke.dashOffset ?? 0;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
