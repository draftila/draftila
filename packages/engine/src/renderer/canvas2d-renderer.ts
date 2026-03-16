import type { Camera, LayoutGuide, Shadow, StrokeDashPattern, Viewport } from '@draftila/shared';
import type {
  ImageRenderOptions,
  Renderer,
  RenderStyle,
  RenderTransform,
  TextRenderOptions,
} from './types';

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
    this.applyLayerBlur(style);

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

    this.clearFilter();
    ctx.restore();
  }

  drawEllipse(transform: RenderTransform, style: RenderStyle) {
    const { ctx } = this;
    ctx.save();
    this.applyTransform(transform);
    ctx.globalAlpha = style.opacity;
    this.applyLayerBlur(style);

    const cx = transform.width / 2;
    const cy = transform.height / 2;
    const rx = transform.width / 2;
    const ry = transform.height / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.applyFillStroke(style);
    ctx.closePath();

    this.clearFilter();
    ctx.restore();
  }

  drawPath(points: Array<[number, number]>, style: RenderStyle, closed = true) {
    const { ctx } = this;
    if (points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = style.opacity;
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

    for (const fill of style.fills) {
      if (!fill.visible) continue;
      ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);
      if (dropShadows.length > 0) {
        for (const shadow of dropShadows) {
          this.applyDropShadow(shadow);
          ctx.fill(path);
        }
        this.clearShadow();
      } else {
        ctx.fill(path);
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

      const frameRatio = frameWidth / frameHeight;
      const imageRatio = imageWidth / imageHeight;

      if (options.fit === 'fit') {
        const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
        const destWidth = imageWidth * scale;
        const destHeight = imageHeight * scale;
        const destX = (frameWidth - destWidth) / 2;
        const destY = (frameHeight - destHeight) / 2;
        ctx.drawImage(image, destX, destY, destWidth, destHeight);
        return;
      }

      let srcX = 0;
      let srcY = 0;
      let srcWidth = imageWidth;
      let srcHeight = imageHeight;

      if (imageRatio > frameRatio) {
        srcWidth = imageHeight * frameRatio;
        srcX = (imageWidth - srcWidth) / 2;
      } else {
        srcHeight = imageWidth / frameRatio;
        srcY = (imageHeight - srcHeight) / 2;
      }

      ctx.drawImage(image, srcX, srcY, srcWidth, srcHeight, 0, 0, frameWidth, frameHeight);
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

  drawSnapLine(axis: 'x' | 'y', position: number, start: number, end: number) {
    const { ctx } = this;
    const GUIDE_COLOR = '#FF00FF';
    const EXTENSION = 8;

    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 0.5;
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

  measureFrameLabel(name: string, zoom: number): { width: number; height: number } {
    const { ctx } = this;
    const fontSize = 11 / zoom;
    ctx.save();
    ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
    const metrics = ctx.measureText(name);
    ctx.restore();
    return { width: metrics.width, height: fontSize };
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

  private applyLayerBlur(style: RenderStyle) {
    const layerBlur = style.blurs.find((b) => b.type === 'layer' && b.visible !== false);
    if (layerBlur && layerBlur.radius > 0) {
      this.ctx.filter = `blur(${layerBlur.radius}px)`;
    }
  }

  private clearFilter() {
    this.ctx.filter = 'none';
  }

  private applyFillStroke(style: RenderStyle) {
    const { ctx } = this;
    const dropShadows = style.shadows.filter((s) => s.type === 'drop' && s.visible !== false);

    for (const fill of style.fills) {
      if (!fill.visible) continue;
      ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);
      if (dropShadows.length > 0) {
        for (const shadow of dropShadows) {
          this.applyDropShadow(shadow);
          ctx.fill();
        }
        this.clearShadow();
      } else {
        ctx.fill();
      }
    }

    if (style.fills.length === 0 && dropShadows.length > 0) {
      for (const shadow of dropShadows) {
        this.applyDropShadow(shadow);
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
      }
      this.clearShadow();
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
}
