import type {
  Camera,
  Fill,
  Gradient,
  LayoutGuide,
  Shadow,
  Stroke,
  StrokeDashPattern,
  Viewport,
} from '@draftila/shared';
import type {
  ImageRenderOptions,
  Renderer,
  RenderStyle,
  RenderTransform,
  TextRenderOptions,
} from './types';
import { resolveCanvasFontFamily } from '../font-manager';

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

function truncateLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '\u2026';
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (ctx.measureText(text.slice(0, mid)).width + ellipsisWidth <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo === 0 ? ellipsis : text.slice(0, lo) + ellipsis;
}

function resolveDashArray(stroke: Stroke): number[] {
  if (stroke.dashArray && stroke.dashArray.length > 0) {
    return stroke.dashArray;
  }
  return dashPatternToArray(stroke.dashPattern ?? 'solid', stroke.width);
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

function shadowColorToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export class Canvas2DRenderer implements Renderer {
  private static imageCache = new Map<string, HTMLImageElement>();
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
    const { ctx } = this;
    const opacity = Math.min((zoom - 8) / 8, 1);
    if (opacity <= 0) return;

    const startX = Math.floor(viewport.minX);
    const endX = Math.ceil(viewport.maxX);
    const startY = Math.floor(viewport.minY);
    const endY = Math.ceil(viewport.maxY);

    const buildGridPath = () => {
      ctx.beginPath();
      for (let x = startX; x <= endX; x++) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y++) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
    };

    ctx.save();
    ctx.lineWidth = 1 / zoom;

    ctx.strokeStyle = `rgba(0, 0, 0, ${0.15 * opacity})`;
    buildGridPath();
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * opacity})`;
    buildGridPath();
    ctx.stroke();

    ctx.restore();
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
    this.applyBlendMode(style);

    const hasRadius = Array.isArray(cornerRadius)
      ? cornerRadius.some((r) => r > 0)
      : cornerRadius > 0;

    const shapePath = new Path2D();
    if (hasRadius) {
      shapePath.roundRect(0, 0, transform.width, transform.height, cornerRadius);
    } else {
      shapePath.rect(0, 0, transform.width, transform.height);
    }

    const buildClip = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      if (hasRadius) {
        c.roundRect(0, 0, transform.width, transform.height, cornerRadius);
      } else {
        c.rect(0, 0, transform.width, transform.height);
      }
    };

    this.applyBackgroundBlur(style, buildClip);
    this.applyLayerBlur(style);

    buildClip(ctx);
    this.applyFillStroke(style, transform.width, transform.height, shapePath);
    ctx.closePath();

    this.clearFilter();
    ctx.restore();
  }

  drawEllipse(transform: RenderTransform, style: RenderStyle) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);
    ctx.globalAlpha = style.opacity;
    this.applyBlendMode(style);

    const cx = transform.width / 2;
    const cy = transform.height / 2;
    const rx = transform.width / 2;
    const ry = transform.height / 2;

    const shapePath = new Path2D();
    shapePath.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    const buildClip = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    };

    this.applyBackgroundBlur(style, buildClip);
    this.applyLayerBlur(style);

    buildClip(ctx);
    this.applyFillStroke(style, transform.width, transform.height, shapePath);
    ctx.closePath();

    this.clearFilter();
    ctx.restore();
  }

  drawPath(points: Array<[number, number]>, style: RenderStyle, closed = true) {
    const { ctx } = this;
    if (points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = style.opacity;
    this.applyBlendMode(style);
    this.applyLayerBlur(style);

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

    const dropShadows = style.shadows.filter((s) => s.type === 'drop' && s.visible !== false);

    let pathMinX = Infinity;
    let pathMinY = Infinity;
    let pathMaxX = -Infinity;
    let pathMaxY = -Infinity;
    for (const [px, py] of points) {
      if (px < pathMinX) pathMinX = px;
      if (py < pathMinY) pathMinY = py;
      if (px > pathMaxX) pathMaxX = px;
      if (py > pathMaxY) pathMaxY = py;
    }
    const pathWidth = pathMaxX - pathMinX;
    const pathHeight = pathMaxY - pathMinY;

    for (const fill of style.fills) {
      if (!fill.visible) continue;
      if (fill.gradient) {
        ctx.save();
        ctx.translate(pathMinX, pathMinY);
        ctx.fillStyle = this.getFillStyle(fill, pathWidth, pathHeight);
        ctx.translate(-pathMinX, -pathMinY);
      } else {
        ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);
      }
      if (dropShadows.length > 0) {
        for (const shadow of dropShadows) {
          this.applyDropShadow(shadow);
          ctx.fill(path);
        }
        this.clearShadow();
      } else {
        ctx.fill(path);
      }
      if (fill.gradient) {
        ctx.restore();
      }
    }

    if (style.fills.length === 0 && dropShadows.length > 0) {
      for (const shadow of dropShadows) {
        this.applyDropShadow(shadow);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill(path);
      }
      this.clearShadow();
    }

    this.applyAlignedStrokes(style.strokes, path, closed);

    const innerShadows = style.shadows.filter((s) => s.type === 'inner' && s.visible !== false);
    if (innerShadows.length > 0 && closed) {
      ctx.save();
      ctx.clip(path);
      for (const shadow of innerShadows) {
        this.applyDropShadow(shadow);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
      }
      this.clearShadow();
      ctx.restore();
    }

    this.clearFilter();
    ctx.restore();
  }

  drawSvgPath(
    transform: RenderTransform,
    pathData: string,
    style: RenderStyle,
    fillRule: 'nonzero' | 'evenodd' = 'nonzero',
  ) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);
    ctx.globalAlpha = style.opacity;
    this.applyBlendMode(style);
    this.applyLayerBlur(style);

    const path = new Path2D(pathData);
    const dropShadows = style.shadows.filter((s) => s.type === 'drop' && s.visible !== false);

    for (const fill of style.fills) {
      if (!fill.visible) continue;
      ctx.fillStyle = this.getFillStyle(fill, transform.width, transform.height);
      if (dropShadows.length > 0) {
        for (const shadow of dropShadows) {
          this.applyDropShadow(shadow);
          ctx.fill(path, fillRule);
        }
        this.clearShadow();
      } else {
        ctx.fill(path, fillRule);
      }
    }

    if (style.fills.length === 0 && dropShadows.length > 0) {
      for (const shadow of dropShadows) {
        this.applyDropShadow(shadow);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill(path, fillRule);
      }
      this.clearShadow();
    }

    this.applyAlignedStrokes(style.strokes, path);

    const innerShadows = style.shadows.filter((s) => s.type === 'inner' && s.visible !== false);
    if (innerShadows.length > 0) {
      ctx.save();
      ctx.clip(path, fillRule);
      for (const shadow of innerShadows) {
        this.applyDropShadow(shadow);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
      }
      this.clearShadow();
      ctx.restore();
    }

    this.clearFilter();
    ctx.restore();
  }

  drawText(transform: RenderTransform, options: TextRenderOptions) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);

    const layerBlur = options.blurs.find((b) => b.type === 'layer' && b.visible !== false);
    if (layerBlur && layerBlur.radius > 0) {
      ctx.filter = `blur(${layerBlur.radius}px)`;
    }

    const dropShadow = options.shadows.find((s) => s.type === 'drop' && s.visible !== false);
    if (dropShadow) {
      this.applyDropShadow(dropShadow);
    }

    if (options.segments && options.segments.length > 0) {
      this.drawSegmentedText(transform, options);
    } else {
      this.drawPlainText(transform, options);
    }

    ctx.restore();
  }

  private drawPlainText(transform: RenderTransform, options: TextRenderOptions) {
    const { ctx } = this;

    const fontStyle = options.fontStyle === 'italic' ? 'italic' : '';
    const resolvedFamily = resolveCanvasFontFamily(options.fontFamily);
    ctx.font = `${fontStyle} ${options.fontWeight} ${options.fontSize}px ${resolvedFamily}`.trim();
    ctx.textAlign = options.textAlign;
    ctx.textBaseline = 'middle';

    const visibleFill = options.fills.find((f) => f.visible);
    const fillStyle: string | CanvasGradient | null = visibleFill
      ? this.getFillStyle(visibleFill, transform.width, transform.height)
      : null;

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
    }

    const content = applyTextTransform(options.content, options.textTransform);
    let lines = wrapText(ctx, content, transform.width);
    const lineHeight = options.fontSize * options.lineHeight;
    const isTruncating = options.textTruncation === 'ending';

    if (isTruncating) {
      const maxLines = Math.max(1, Math.floor(transform.height / lineHeight));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        const lastLine = lines[maxLines - 1];
        if (lastLine !== undefined) {
          lines[maxLines - 1] = truncateLine(ctx, lastLine, transform.width);
        }
      }
    }

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
      const y = offsetY + i * lineHeight + lineHeight / 2;
      if (fillStyle) {
        ctx.fillText(line, textX, y);
      }

      if (options.textDecoration !== 'none') {
        const metrics = ctx.measureText(line);
        let lineStartX = textX;
        if (options.textAlign === 'center') lineStartX = textX - metrics.width / 2;
        else if (options.textAlign === 'right') lineStartX = textX - metrics.width;
        const lineTopY = y - lineHeight / 2;
        const decoY =
          options.textDecoration === 'strikethrough'
            ? lineTopY + options.fontSize * 0.55
            : lineTopY + options.fontSize * 0.95;
        ctx.beginPath();
        ctx.strokeStyle =
          typeof fillStyle === 'string' ? fillStyle : visibleFill ? visibleFill.color : '#000000';
        ctx.lineWidth = Math.max(1, options.fontSize / 16);
        ctx.moveTo(lineStartX, decoY);
        ctx.lineTo(lineStartX + metrics.width, decoY);
        ctx.stroke();
      }
    }
  }

  private drawSegmentedText(transform: RenderTransform, options: TextRenderOptions) {
    const { ctx } = this;
    const segments = options.segments!;

    const baseFontStyle = options.fontStyle === 'italic' ? 'italic' : '';
    const baseFontWeight = options.fontWeight;
    const baseFontSize = options.fontSize;
    const baseFontFamily = resolveCanvasFontFamily(options.fontFamily);
    const baseLetterSpacing = options.letterSpacing;

    const visibleFill = options.fills.find((f) => f.visible);
    const baseColor = visibleFill
      ? colorWithOpacity(visibleFill.color, visibleFill.opacity)
      : '#000000';

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const fullText = segments.map((s) => s.text).join('');
    const content = applyTextTransform(fullText, options.textTransform);

    ctx.font = `${baseFontStyle} ${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`.trim();
    if (baseLetterSpacing !== 0) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${baseLetterSpacing}px`;
    }
    let lines = wrapText(ctx, content, transform.width);
    const lineHeight = baseFontSize * options.lineHeight;
    const isTruncating = options.textTruncation === 'ending';

    if (isTruncating) {
      const maxLines = Math.max(1, Math.floor(transform.height / lineHeight));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        const lastLine = lines[maxLines - 1];
        if (lastLine !== undefined) {
          lines[maxLines - 1] = truncateLine(ctx, lastLine, transform.width);
        }
      }
    }

    const totalTextHeight = lines.length * lineHeight;

    let offsetY = 0;
    if (options.verticalAlign === 'middle') {
      offsetY = (transform.height - totalTextHeight) / 2;
    } else if (options.verticalAlign === 'bottom') {
      offsetY = transform.height - totalTextHeight;
    }

    interface CharStyle {
      char: string;
      color: string;
      fontSize: number;
      fontFamily: string;
      fontWeight: number;
      fontStyle: string;
      letterSpacing: number;
      textDecoration: string;
      gradient?: NonNullable<(typeof segments)[number]['gradient']>;
    }

    const charStyles: CharStyle[] = [];
    let segOffset = 0;
    for (const seg of segments) {
      const segText = content.substring(segOffset, segOffset + seg.text.length);
      for (const char of segText) {
        charStyles.push({
          char,
          color: seg.color ?? baseColor,
          fontSize: seg.fontSize ?? baseFontSize,
          fontFamily: seg.fontFamily ? resolveCanvasFontFamily(seg.fontFamily) : baseFontFamily,
          fontWeight: seg.fontWeight ?? baseFontWeight,
          fontStyle: seg.fontStyle === 'italic' ? 'italic' : baseFontStyle,
          letterSpacing: seg.letterSpacing ?? baseLetterSpacing,
          textDecoration: seg.textDecoration ?? options.textDecoration,
          gradient: seg.gradient,
        });
      }
      segOffset += seg.text.length;
    }

    let charIdx = 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (line === undefined) continue;
      const y = offsetY + li * lineHeight + lineHeight / 2;

      const lineChars = charStyles.slice(charIdx, charIdx + line.length);
      charIdx += line.length;
      if (charIdx < charStyles.length && charStyles[charIdx]?.char === ' ') {
        charIdx++;
      }

      let lineWidth = 0;
      for (const cs of lineChars) {
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}px ${cs.fontFamily}`.trim();
        ctx.font = font;
        lineWidth += ctx.measureText(cs.char).width;
      }

      let startX = 0;
      if (options.textAlign === 'center') startX = (transform.width - lineWidth) / 2;
      else if (options.textAlign === 'right') startX = transform.width - lineWidth;

      let cursorX = startX;
      for (const cs of lineChars) {
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}px ${cs.fontFamily}`.trim();
        ctx.font = font;
        if (cs.letterSpacing !== 0) {
          (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
            `${cs.letterSpacing}px`;
        }

        if (cs.gradient) {
          ctx.fillStyle = this.createGradient(cs.gradient, transform.width, transform.height);
        } else {
          ctx.fillStyle = cs.color;
        }
        ctx.fillText(cs.char, cursorX, y);

        if (cs.textDecoration !== 'none') {
          const charWidth = ctx.measureText(cs.char).width;
          const decoY =
            cs.textDecoration === 'strikethrough'
              ? y - lineHeight / 2 + cs.fontSize * 0.55
              : y - lineHeight / 2 + cs.fontSize * 0.95;
          ctx.beginPath();
          ctx.strokeStyle = cs.color;
          ctx.lineWidth = Math.max(1, cs.fontSize / 16);
          ctx.moveTo(cursorX, decoY);
          ctx.lineTo(cursorX + charWidth, decoY);
          ctx.stroke();
        }

        cursorX += ctx.measureText(cs.char).width;
      }
    }
  }

  drawImage(transform: RenderTransform, options: ImageRenderOptions) {
    const { ctx } = this;
    const image = this.getLoadedImage(options.src);

    if (!image) {
      this.drawRect(
        transform,
        {
          fills: [{ color: '#E0E0E0', opacity: 1, visible: true }],
          strokes: [
            {
              color: '#BDBDBD',
              width: 1,
              opacity: 1,
              visible: true,
              cap: 'butt',
              join: 'miter',
              align: 'center',
              dashPattern: 'solid',
              dashOffset: 0,
              miterLimit: 4,
            },
          ],
          shadows: options.shadows,
          blurs: options.blurs,
          opacity: options.opacity,
        },
        0,
      );
      return;
    }

    const drawImageContent = () => {
      const frameWidth = transform.width;
      const frameHeight = transform.height;
      const imageWidth = image.naturalWidth;
      const imageHeight = image.naturalHeight;

      if (options.fit === 'fill') {
        ctx.drawImage(image, 0, 0, frameWidth, frameHeight);
        return;
      }

      if (options.fit === 'fit') {
        const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
        const destWidth = imageWidth * scale;
        const destHeight = imageHeight * scale;
        const destX = (frameWidth - destWidth) / 2;
        const destY = (frameHeight - destHeight) / 2;
        ctx.drawImage(image, destX, destY, destWidth, destHeight);
        return;
      }

      const anchorX = options.cropX ?? 0.5;
      const anchorY = options.cropY ?? 0.5;

      const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
      const scaledW = imageWidth * scale;
      const scaledH = imageHeight * scale;
      const offsetX = (frameWidth - scaledW) * anchorX;
      const offsetY = (frameHeight - scaledH) * anchorY;

      ctx.drawImage(image, offsetX, offsetY, scaledW, scaledH);
    };

    ctx.save();
    this.applyTransform(transform);
    ctx.globalAlpha = options.opacity;
    this.applyLayerBlur({
      fills: [],
      strokes: [],
      shadows: options.shadows,
      blurs: options.blurs,
      opacity: 1,
    });

    ctx.beginPath();
    ctx.rect(0, 0, transform.width, transform.height);
    ctx.clip();

    const dropShadows = options.shadows.filter((s) => s.type === 'drop' && s.visible !== false);
    if (dropShadows.length > 0) {
      for (const shadow of dropShadows) {
        this.applyDropShadow(shadow);
        drawImageContent();
      }
      this.clearShadow();
    } else {
      drawImageContent();
    }

    this.clearFilter();
    ctx.restore();
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
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = SELECTION_WIDTH / zoom;
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

  drawHoverOutline(
    x: number,
    y: number,
    width: number,
    height: number,
    zoom: number,
    rotation = 0,
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = SELECTION_WIDTH / zoom;
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

  drawMarquee(x: number, y: number, width: number, height: number, zoom: number) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = MARQUEE_FILL;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = MARQUEE_STROKE;
    ctx.lineWidth = 1 / zoom;
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

  drawPathNode(x: number, y: number, zoom: number, selected: boolean) {
    const { ctx } = this;
    const size = 6 / zoom;
    ctx.save();
    ctx.fillStyle = selected ? SELECTION_COLOR : '#FFFFFF';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.rect(x - size / 2, y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawBezierHandle(x: number, y: number, zoom: number) {
    const { ctx } = this;
    const radius = 3 / zoom;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawControlLine(x1: number, y1: number, x2: number, y2: number, zoom: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  drawGuide(
    axis: 'x' | 'y',
    position: number,
    viewport: Viewport,
    zoom: number,
    selected: boolean,
  ) {
    const { ctx } = this;
    const GUIDE_COLOR = '#00BCD4';

    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = (selected ? 2 : 1) / zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (axis === 'x') {
      ctx.moveTo(position, viewport.minY);
      ctx.lineTo(position, viewport.maxY);
    } else {
      ctx.moveTo(viewport.minX, position);
      ctx.lineTo(viewport.maxX, position);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawGuidePositionLabel(axis: 'x' | 'y', position: number, zoom: number) {
    const { ctx } = this;
    const label = Math.round(position).toString();
    const fontSize = 10 / zoom;
    const paddingX = 4 / zoom;
    const paddingY = 2 / zoom;

    ctx.save();
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    const textMetrics = ctx.measureText(label);
    const bgW = textMetrics.width + paddingX * 2;
    const bgH = fontSize + paddingY * 2;

    const offset = 8 / zoom;

    if (axis === 'x') {
      const labelX = position + offset;
      const labelY = -ctx.getTransform().f / zoom + offset;
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(labelX, labelY, bgW, bgH);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, labelX + paddingX, labelY + paddingY);
    } else {
      const labelX = -ctx.getTransform().e / zoom + offset;
      const labelY = position + offset;
      ctx.fillStyle = '#00BCD4';
      ctx.fillRect(labelX, labelY, bgW, bgH);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, labelX + paddingX, labelY + paddingY);
    }

    ctx.restore();
  }

  drawSnapLine(axis: 'x' | 'y', position: number, start: number, end: number, zoom: number) {
    const { ctx } = this;
    const GUIDE_COLOR = '#FF00FF';
    const EXTENSION = 8 / zoom;

    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 0.5 / zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (axis === 'x') {
      ctx.moveTo(position, start - EXTENSION);
      ctx.lineTo(position, end + EXTENSION);
    } else {
      ctx.moveTo(start - EXTENSION, position);
      ctx.lineTo(end + EXTENSION, position);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawDistanceIndicator(axis: 'x' | 'y', from: number, to: number, position: number, zoom: number) {
    const { ctx } = this;
    const INDICATOR_COLOR = '#FF00FF';
    const distance = Math.abs(to - from);
    if (distance < 1) return;

    const label = Math.round(distance).toString();
    const fontSize = 10 / zoom;
    const tickSize = 3 / zoom;
    const paddingX = 3 / zoom;
    const paddingY = 1.5 / zoom;

    ctx.save();
    ctx.strokeStyle = INDICATOR_COLOR;
    ctx.fillStyle = INDICATOR_COLOR;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);

    if (axis === 'x') {
      ctx.beginPath();
      ctx.moveTo(from, position);
      ctx.lineTo(to, position);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(from, position - tickSize);
      ctx.lineTo(from, position + tickSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(to, position - tickSize);
      ctx.lineTo(to, position + tickSize);
      ctx.stroke();

      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const midX = (from + to) / 2;
      const textMetrics = ctx.measureText(label);
      const bgW = textMetrics.width + paddingX * 2;
      const bgH = fontSize + paddingY * 2;
      ctx.fillStyle = INDICATOR_COLOR;
      ctx.fillRect(midX - bgW / 2, position - bgH - tickSize, bgW, bgH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, midX, position - tickSize - paddingY);
    } else {
      ctx.beginPath();
      ctx.moveTo(position, from);
      ctx.lineTo(position, to);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(position - tickSize, from);
      ctx.lineTo(position + tickSize, from);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(position - tickSize, to);
      ctx.lineTo(position + tickSize, to);
      ctx.stroke();

      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const midY = (from + to) / 2;
      const textMetrics = ctx.measureText(label);
      const bgW = textMetrics.width + paddingX * 2;
      const bgH = fontSize + paddingY * 2;
      ctx.fillStyle = INDICATOR_COLOR;
      ctx.fillRect(position + tickSize, midY - bgH / 2, bgW, bgH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, position + tickSize + paddingX, midY);
    }

    ctx.restore();
  }

  drawSizeLabel(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    zoom: number,
  ) {
    const { ctx } = this;
    const roundedW = Math.round(width);
    const roundedH = Math.round(height);
    const label = `${roundedW} \u00D7 ${roundedH}`;

    const fontSize = 11 / zoom;
    const paddingX = 6 / zoom;
    const paddingY = 3 / zoom;
    const offsetY = 8 / zoom;
    const borderRadius = 3 / zoom;

    ctx.save();
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(label);
    const bgW = textMetrics.width + paddingX * 2;
    const bgH = fontSize + paddingY * 2;

    let labelX: number;
    let labelY: number;

    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const hw = width / 2;
      const hh = height / 2;
      const corners = [
        { rx: -hw, ry: -hh },
        { rx: hw, ry: -hh },
        { rx: hw, ry: hh },
        { rx: -hw, ry: hh },
      ];
      let maxY = -Infinity;
      let bottomCenterX = cx;
      for (const corner of corners) {
        const worldY = cy + corner.rx * sin + corner.ry * cos;
        if (worldY > maxY) {
          maxY = worldY;
        }
      }
      const bottomMidRx = 0;
      const bottomMidRy = hh;
      bottomCenterX = cx + bottomMidRx * cos - bottomMidRy * sin;
      labelX = bottomCenterX;
      labelY = maxY + offsetY + bgH / 2;
    } else {
      labelX = x + width / 2;
      labelY = y + height + offsetY + bgH / 2;
    }

    ctx.beginPath();
    ctx.roundRect(labelX - bgW / 2, labelY - bgH / 2, bgW, bgH, borderRadius);
    ctx.fillStyle = SELECTION_COLOR;
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, labelX, labelY);

    ctx.restore();
  }

  drawFrameLabel(x: number, y: number, name: string, zoom: number, selected: boolean) {
    const { ctx } = this;
    const fontSize = 11 / zoom;
    const offsetY = 4 / zoom;

    ctx.save();
    ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = selected ? SELECTION_COLOR : '#999999';
    ctx.fillText(name, x, y - offsetY);
    ctx.restore();
  }

  drawLayoutGuides(transform: RenderTransform, guides: LayoutGuide[]) {
    const { ctx } = this;
    for (const guide of guides) {
      if (guide.visible === false) continue;
      ctx.save();
      this.applyTransform(transform);

      const color = shadowColorToRgba(guide.color);
      const { width, height } = transform;

      if (guide.type === 'grid') {
        ctx.fillStyle = color;
        for (let x = 0; x < width; x += guide.size) {
          for (let y = 0; y < height; y += guide.size) {
            ctx.fillRect(x, y, guide.size, guide.size);
            ctx.clearRect(x + 0.5, y + 0.5, guide.size - 1, guide.size - 1);
          }
        }
      } else if (guide.type === 'columns') {
        ctx.fillStyle = color;
        for (let x = 0; x < width; x += guide.size) {
          ctx.fillRect(x, 0, guide.size, height);
          x += guide.size;
        }
      } else if (guide.type === 'rows') {
        ctx.fillStyle = color;
        for (let y = 0; y < height; y += guide.size) {
          ctx.fillRect(0, y, width, guide.size);
          y += guide.size;
        }
      }

      ctx.restore();
    }
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
    const { ctx } = this;
    const fontSize = 11 / zoom;
    ctx.save();
    ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
    const metrics = ctx.measureText(name);
    ctx.restore();
    return { width: metrics.width, height: fontSize };
  }

  drawShimmerOverlay(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    cornerRadius: number | [number, number, number, number],
    shimmerPhase: number,
    isLightBackground: boolean = false,
  ) {
    const { ctx } = this;
    ctx.save();

    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);
    } else {
      ctx.translate(x, y);
    }

    ctx.beginPath();
    const hasRadius = Array.isArray(cornerRadius)
      ? cornerRadius.some((r) => r > 0)
      : cornerRadius > 0;
    if (hasRadius) {
      ctx.roundRect(0, 0, width, height, cornerRadius);
    } else {
      ctx.rect(0, 0, width, height);
    }
    ctx.clip();

    ctx.fillStyle = isLightBackground ? 'rgba(60, 60, 80, 0.04)' : 'rgba(180, 190, 210, 0.06)';
    ctx.fillRect(0, 0, width, height);

    const diagonal = Math.sqrt(width * width + height * height);
    const bandWidth = diagonal * 0.4;
    const totalTravel = diagonal + bandWidth;
    const offset = shimmerPhase * totalTravel - bandWidth;

    const angle = Math.atan2(height, width);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const gx0 = offset * cos;
    const gy0 = offset * sin;
    const gx1 = (offset + bandWidth) * cos;
    const gy1 = (offset + bandWidth) * sin;

    const shimmerColor = isLightBackground ? '0, 0, 0' : '255, 255, 255';
    const gradient = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    gradient.addColorStop(0, `rgba(${shimmerColor}, 0)`);
    gradient.addColorStop(0.3, `rgba(${shimmerColor}, 0.06)`);
    gradient.addColorStop(0.5, `rgba(${shimmerColor}, 0.1)`);
    gradient.addColorStop(0.7, `rgba(${shimmerColor}, 0.06)`);
    gradient.addColorStop(1, `rgba(${shimmerColor}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -shimmerPhase * 40;
    ctx.beginPath();
    if (hasRadius) {
      ctx.roundRect(0, 0, width, height, cornerRadius);
    } else {
      ctx.rect(0, 0, width, height);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
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

  private getLoadedImage(src: string): HTMLImageElement | null {
    if (!src) return null;

    let image = Canvas2DRenderer.imageCache.get(src);
    if (!image) {
      image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = src;
      Canvas2DRenderer.imageCache.set(src, image);
      return null;
    }

    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return null;
    }

    return image;
  }

  private createGradient(gradient: Gradient, width: number, height: number): CanvasGradient {
    const { ctx } = this;
    if (gradient.type === 'linear') {
      const angleRad = ((gradient.angle ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const cx = width / 2;
      const cy = height / 2;
      const len = Math.abs(width * cos) / 2 + Math.abs(height * sin) / 2;
      const canvasGradient = ctx.createLinearGradient(
        cx - len * cos,
        cy - len * sin,
        cx + len * cos,
        cy + len * sin,
      );
      for (const stop of gradient.stops) {
        canvasGradient.addColorStop(stop.position, stop.color);
      }
      return canvasGradient;
    }

    const gcx = (gradient.cx ?? 0.5) * width;
    const gcy = (gradient.cy ?? 0.5) * height;
    const gr = (gradient.r ?? 0.5) * Math.max(width, height);
    const canvasGradient = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, gr);
    for (const stop of gradient.stops) {
      canvasGradient.addColorStop(stop.position, stop.color);
    }
    return canvasGradient;
  }

  private getFillStyle(fill: Fill, width: number, height: number): string | CanvasGradient {
    if (fill.gradient) {
      return this.createGradient(fill.gradient, width, height);
    }
    return colorWithOpacity(fill.color, fill.opacity);
  }

  private applyDropShadow(shadow: Shadow) {
    const { ctx } = this;
    ctx.shadowColor = shadowColorToRgba(shadow.color);
    ctx.shadowOffsetX = shadow.x;
    ctx.shadowOffsetY = shadow.y;
    ctx.shadowBlur = shadow.blur;
  }

  private clearShadow() {
    const { ctx } = this;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }

  private applyBlendMode(style: RenderStyle) {
    if (style.blendMode && style.blendMode !== 'normal') {
      this.ctx.globalCompositeOperation = style.blendMode as GlobalCompositeOperation;
    }
  }

  private applyLayerBlur(style: RenderStyle) {
    const layerBlur = style.blurs.find((b) => b.type === 'layer' && b.visible !== false);
    if (layerBlur && layerBlur.radius > 0) {
      this.ctx.filter = `blur(${layerBlur.radius}px)`;
    }
  }

  private applyBackgroundBlur(
    style: RenderStyle,
    buildClipPath: (ctx: CanvasRenderingContext2D) => void,
  ) {
    const bgBlur = style.blurs.find((b) => b.type === 'background' && b.visible !== false);
    if (!bgBlur || bgBlur.radius <= 0) return;

    const { ctx, canvas } = this;
    const r = bgBlur.radius;
    const currentTransform = ctx.getTransform();
    ctx.save();

    buildClipPath(ctx);
    ctx.clip();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width / this.dpr,
      canvas.height / this.dpr,
    );
    ctx.filter = 'none';
    ctx.setTransform(currentTransform);

    ctx.restore();
  }

  private clearFilter() {
    this.ctx.filter = 'none';
  }

  private applyAlignedStrokes(strokes: Stroke[], path: Path2D, closed = true) {
    const { ctx } = this;
    for (const stroke of strokes) {
      if (!stroke.visible || stroke.width <= 0) continue;
      ctx.strokeStyle = colorWithOpacity(stroke.color, stroke.opacity);
      ctx.lineCap = stroke.cap ?? 'butt';
      ctx.lineJoin = stroke.join ?? 'miter';
      ctx.miterLimit = stroke.miterLimit ?? 4;
      ctx.setLineDash(resolveDashArray(stroke));
      ctx.lineDashOffset = stroke.dashOffset ?? 0;

      const align = stroke.align ?? 'inside';

      if ((align === 'inside' || (align === 'center' && closed)) && closed) {
        ctx.save();
        ctx.clip(path);
        ctx.lineWidth = stroke.width * 2;
        ctx.stroke(path);
        ctx.restore();
      } else if (align === 'outside' && closed) {
        ctx.save();
        ctx.lineWidth = stroke.width * 2;
        const inversePath = new Path2D();
        inversePath.rect(-1e5, -1e5, 2e5, 2e5);
        inversePath.addPath(path);
        ctx.clip(inversePath, 'evenodd');
        ctx.stroke(path);
        ctx.restore();
      } else {
        ctx.lineWidth = stroke.width;
        ctx.stroke(path);
      }
      ctx.setLineDash([]);
    }
  }

  private applyFillStroke(style: RenderStyle, width = 0, height = 0, shapePath?: Path2D) {
    const { ctx } = this;
    const dropShadows = style.shadows.filter((s) => s.type === 'drop' && s.visible !== false);

    if (dropShadows.length > 0) {
      const firstVisibleFill = style.fills.find((f) => f.visible);
      ctx.fillStyle = firstVisibleFill
        ? this.getFillStyle(firstVisibleFill, width, height)
        : 'rgba(0,0,0,0)';
      for (const shadow of dropShadows) {
        this.applyDropShadow(shadow);
        ctx.fill();
      }
      this.clearShadow();
    }

    for (const fill of style.fills) {
      if (!fill.visible) continue;
      if (fill.imageSrc) {
        const img = this.getLoadedImage(fill.imageSrc);
        if (img) {
          ctx.save();
          ctx.clip();
          ctx.globalAlpha *= fill.opacity;
          const fit = fill.imageFit ?? 'fill';
          if (fit === 'fill') {
            ctx.drawImage(img, 0, 0, width, height);
          } else if (fit === 'fit') {
            const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
          } else if (fit === 'crop') {
            const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
          } else if (fit === 'tile') {
            const pattern = ctx.createPattern(img, 'repeat');
            if (pattern) {
              const previousFillStyle = ctx.fillStyle;
              ctx.fillStyle = pattern;
              ctx.fillRect(0, 0, width, height);
              ctx.fillStyle = previousFillStyle;
            }
          }
          ctx.globalAlpha = style.opacity;
          ctx.restore();
        } else {
          ctx.fillStyle = this.getFillStyle(fill, width, height);
          if (!fill.gradient) {
            ctx.globalAlpha *= fill.opacity;
          }
          ctx.fill();
          if (!fill.gradient) {
            ctx.globalAlpha = style.opacity;
          }
        }
        continue;
      }
      ctx.fillStyle = this.getFillStyle(fill, width, height);
      if (!fill.gradient) {
        ctx.globalAlpha *= fill.opacity;
      }
      ctx.fill();
      if (!fill.gradient) {
        ctx.globalAlpha = style.opacity;
      }
    }

    for (const stroke of style.strokes) {
      if (!stroke.visible || stroke.width <= 0) continue;
      ctx.strokeStyle = colorWithOpacity(stroke.color, stroke.opacity);
      ctx.lineCap = stroke.cap ?? 'butt';
      ctx.lineJoin = stroke.join ?? 'miter';
      ctx.miterLimit = stroke.miterLimit ?? 4;
      ctx.setLineDash(resolveDashArray(stroke));
      ctx.lineDashOffset = stroke.dashOffset ?? 0;

      const align = stroke.align ?? 'inside';

      if (stroke.sides && width > 0 && height > 0) {
        ctx.lineWidth = stroke.width;
        this.drawSidedStroke(stroke.sides, width, height);
      } else if ((align === 'inside' || align === 'center') && shapePath) {
        ctx.save();
        ctx.clip(shapePath);
        ctx.lineWidth = stroke.width * 2;
        ctx.stroke();
        ctx.restore();
      } else if (align === 'outside' && shapePath) {
        ctx.save();
        ctx.lineWidth = stroke.width * 2;
        const inversePath = new Path2D();
        inversePath.rect(-1e5, -1e5, 2e5, 2e5);
        inversePath.addPath(shapePath);
        ctx.clip(inversePath, 'evenodd');
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.lineWidth = stroke.width;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    const innerShadows = style.shadows.filter((s) => s.type === 'inner' && s.visible !== false);
    if (innerShadows.length > 0) {
      ctx.save();
      ctx.clip();
      for (const shadow of innerShadows) {
        this.applyDropShadow(shadow);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
      }
      this.clearShadow();
      ctx.restore();
    }
  }

  private drawSidedStroke(
    sides: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean },
    width: number,
    height: number,
  ) {
    const { ctx } = this;
    if (sides.top !== false) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(width, 0);
      ctx.stroke();
    }
    if (sides.right !== false) {
      ctx.beginPath();
      ctx.moveTo(width, 0);
      ctx.lineTo(width, height);
      ctx.stroke();
    }
    if (sides.bottom !== false) {
      ctx.beginPath();
      ctx.moveTo(width, height);
      ctx.lineTo(0, height);
      ctx.stroke();
    }
    if (sides.left !== false) {
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
  }
}
