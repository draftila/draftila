import type { Fill, Gradient, Shadow, Stroke } from '@draftila/shared';
import type { RenderStyle, RenderTransform } from './types';
import { colorWithOpacity, resolveDashArray, shadowColorToRgba } from './style-utils';

export class StyleEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private imageCache: Map<string, HTMLImageElement>;

  constructor(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    dpr: number,
    imageCache: Map<string, HTMLImageElement>,
  ) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.dpr = dpr;
    this.imageCache = imageCache;
  }

  updateDpr(dpr: number) {
    this.dpr = dpr;
  }

  applyTransform(transform: RenderTransform) {
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

  getLoadedImage(src: string): HTMLImageElement | null {
    if (!src) return null;

    let image = this.imageCache.get(src);
    if (!image) {
      image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = src;
      this.imageCache.set(src, image);
    }

    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return null;
    }

    return image;
  }

  createGradient(gradient: Gradient, width: number, height: number): CanvasGradient {
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

  getFillStyle(fill: Fill, width: number, height: number): string | CanvasGradient {
    if (fill.gradient) {
      return this.createGradient(fill.gradient, width, height);
    }
    return colorWithOpacity(fill.color, fill.opacity);
  }

  applyDropShadow(shadow: Shadow) {
    const { ctx } = this;
    ctx.shadowColor = shadowColorToRgba(shadow.color);
    ctx.shadowOffsetX = shadow.x;
    ctx.shadowOffsetY = shadow.y;
    ctx.shadowBlur = shadow.blur;
  }

  clearShadow() {
    const { ctx } = this;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }

  applyBlendMode(style: RenderStyle) {
    if (style.blendMode && style.blendMode !== 'normal') {
      this.ctx.globalCompositeOperation = style.blendMode as GlobalCompositeOperation;
    }
  }

  applyLayerBlur(style: RenderStyle) {
    const layerBlur = style.blurs.find((b) => b.type === 'layer' && b.visible !== false);
    if (layerBlur && layerBlur.radius > 0) {
      this.ctx.filter = `blur(${layerBlur.radius}px)`;
    }
  }

  applyBackgroundBlur(style: RenderStyle, buildClipPath: (ctx: CanvasRenderingContext2D) => void) {
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

  clearFilter() {
    this.ctx.filter = 'none';
  }

  applyAlignedStrokes(strokes: Stroke[], path: Path2D, closed = true) {
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

  applyFillStroke(style: RenderStyle, width = 0, height = 0, shapePath?: Path2D) {
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

  drawSidedStroke(
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
