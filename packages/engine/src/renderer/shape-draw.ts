import type { ImageRenderOptions, RenderStyle, RenderTransform } from './types';
import type { StyleEngine } from './style-engine';
import { colorWithOpacity } from './style-utils';

export function drawRect(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  style: RenderStyle,
  cornerRadius: number | [number, number, number, number],
) {
  ctx.save();
  se.applyTransform(transform);
  ctx.globalAlpha = style.opacity;
  se.applyBlendMode(style);

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

  se.applyBackgroundBlur(style, buildClip);
  se.applyLayerBlur(style);

  buildClip(ctx);
  se.applyFillStroke(style, transform.width, transform.height, shapePath);
  ctx.closePath();

  se.clearFilter();
  ctx.restore();
}

export function drawEllipse(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  style: RenderStyle,
) {
  ctx.save();
  se.applyTransform(transform);
  ctx.globalAlpha = style.opacity;
  se.applyBlendMode(style);

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

  se.applyBackgroundBlur(style, buildClip);
  se.applyLayerBlur(style);

  buildClip(ctx);
  se.applyFillStroke(style, transform.width, transform.height, shapePath);
  ctx.closePath();

  se.clearFilter();
  ctx.restore();
}

export function drawPath(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  points: Array<[number, number]>,
  style: RenderStyle,
  closed = true,
) {
  if (points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = style.opacity;
  se.applyBlendMode(style);
  se.applyLayerBlur(style);

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
      ctx.fillStyle = se.getFillStyle(fill, pathWidth, pathHeight);
      ctx.translate(-pathMinX, -pathMinY);
    } else {
      ctx.fillStyle = colorWithOpacity(fill.color, fill.opacity);
    }
    if (dropShadows.length > 0) {
      for (const shadow of dropShadows) {
        se.applyDropShadow(shadow);
        ctx.fill(path);
      }
      se.clearShadow();
    } else {
      ctx.fill(path);
    }
    if (fill.gradient) {
      ctx.restore();
    }
  }

  if (style.fills.length === 0 && dropShadows.length > 0) {
    for (const shadow of dropShadows) {
      se.applyDropShadow(shadow);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fill(path);
    }
    se.clearShadow();
  }

  se.applyAlignedStrokes(style.strokes, path, closed);

  const innerShadows = style.shadows.filter((s) => s.type === 'inner' && s.visible !== false);
  if (innerShadows.length > 0 && closed) {
    ctx.save();
    ctx.clip(path);
    for (const shadow of innerShadows) {
      se.applyDropShadow(shadow);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
    }
    se.clearShadow();
    ctx.restore();
  }

  se.clearFilter();
  ctx.restore();
}

export function drawSvgPath(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  pathData: string,
  style: RenderStyle,
  fillRule: 'nonzero' | 'evenodd' = 'nonzero',
) {
  ctx.save();
  se.applyTransform(transform);
  ctx.globalAlpha = style.opacity;
  se.applyBlendMode(style);
  se.applyLayerBlur(style);

  const path = new Path2D(pathData);
  const closed = /[Zz]\s*$/.test(pathData.trim());
  const dropShadows = style.shadows.filter((s) => s.type === 'drop' && s.visible !== false);

  for (const fill of style.fills) {
    if (!fill.visible) continue;
    ctx.fillStyle = se.getFillStyle(fill, transform.width, transform.height);
    if (dropShadows.length > 0) {
      for (const shadow of dropShadows) {
        se.applyDropShadow(shadow);
        ctx.fill(path, fillRule);
      }
      se.clearShadow();
    } else {
      ctx.fill(path, fillRule);
    }
  }

  if (style.fills.length === 0 && dropShadows.length > 0) {
    for (const shadow of dropShadows) {
      se.applyDropShadow(shadow);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fill(path, fillRule);
    }
    se.clearShadow();
  }

  se.applyAlignedStrokes(style.strokes, path, closed);

  const innerShadows = style.shadows.filter((s) => s.type === 'inner' && s.visible !== false);
  if (innerShadows.length > 0) {
    ctx.save();
    ctx.clip(path, fillRule);
    for (const shadow of innerShadows) {
      se.applyDropShadow(shadow);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
    }
    se.clearShadow();
    ctx.restore();
  }

  se.clearFilter();
  ctx.restore();
}

export function drawImage(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  options: ImageRenderOptions,
  drawRectFn: (transform: RenderTransform, style: RenderStyle, cornerRadius: number) => void,
) {
  const image = se.getLoadedImage(options.src);

  if (!image) {
    drawRectFn(
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
  se.applyTransform(transform);
  ctx.globalAlpha = options.opacity;
  se.applyLayerBlur({
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
      se.applyDropShadow(shadow);
      drawImageContent();
    }
    se.clearShadow();
  } else {
    drawImageContent();
  }

  se.clearFilter();
  ctx.restore();
}
