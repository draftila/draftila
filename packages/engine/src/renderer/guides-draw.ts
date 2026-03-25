import type { LayoutGuide, Viewport } from '@draftila/shared';
import type { RenderTransform } from './types';
import type { StyleEngine } from './style-engine';
import { shadowColorToRgba } from './style-utils';
import { SELECTION_COLOR } from './ui-draw';

export function drawGuide(
  ctx: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  position: number,
  viewport: Viewport,
  zoom: number,
  selected: boolean,
) {
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

export function drawGuidePositionLabel(
  ctx: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  position: number,
  zoom: number,
) {
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

export function drawSnapLine(
  ctx: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  position: number,
  start: number,
  end: number,
  zoom: number,
) {
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

export function drawDistanceIndicator(
  ctx: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  from: number,
  to: number,
  position: number,
  zoom: number,
) {
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

export function drawSizeLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  zoom: number,
) {
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

export function drawFrameLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  zoom: number,
  selected: boolean,
) {
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

export function measureFrameLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  zoom: number,
): { width: number; height: number } {
  const fontSize = 11 / zoom;
  ctx.save();
  ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(name);
  ctx.restore();
  return { width: metrics.width, height: fontSize };
}

export function drawLayoutGuides(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  guides: LayoutGuide[],
) {
  for (const guide of guides) {
    if (guide.visible === false) continue;
    ctx.save();
    se.applyTransform(transform);

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

export function drawShimmerOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  cornerRadius: number | [number, number, number, number],
  shimmerPhase: number,
  isLightBackground = false,
) {
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

export function drawPixelGrid(ctx: CanvasRenderingContext2D, viewport: Viewport, zoom: number) {
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
