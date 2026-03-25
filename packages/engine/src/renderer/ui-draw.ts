const SELECTION_COLOR = '#0D99FF';
const SELECTION_WIDTH = 1.5;
const MARQUEE_FILL = 'rgba(13, 153, 255, 0.08)';
const MARQUEE_STROKE = 'rgba(13, 153, 255, 0.5)';

export { SELECTION_COLOR };

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
  rotation = 0,
) {
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

export function drawHoverOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
  rotation = 0,
) {
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

export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
) {
  ctx.save();
  ctx.fillStyle = MARQUEE_FILL;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = MARQUEE_STROKE;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

export function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
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

export function drawRotationHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
) {
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

export function drawPathNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  selected: boolean,
) {
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

export function drawBezierHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
) {
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

export function drawControlLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zoom: number,
) {
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
