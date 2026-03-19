import type { ArrowheadType } from '@draftila/shared';
import SVGPathCommander from 'svg-path-commander';

const CIRCLE_KAPPA = 0.5522847498;
const MAX_SMOOTH_CONTROL_FACTOR = 0.92;

type CornerRadii = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

function clampToNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeCornerRadii(
  width: number,
  height: number,
  cornerRadius: number | [number, number, number, number],
): CornerRadii {
  let tl: number;
  let tr: number;
  let br: number;
  let bl: number;

  if (Array.isArray(cornerRadius)) {
    [tl, tr, br, bl] = cornerRadius;
  } else {
    tl = tr = br = bl = cornerRadius;
  }

  tl = clampToNonNegative(tl);
  tr = clampToNonNegative(tr);
  br = clampToNonNegative(br);
  bl = clampToNonNegative(bl);

  const maxCorner = Math.min(width, height);
  tl = Math.min(tl, maxCorner);
  tr = Math.min(tr, maxCorner);
  br = Math.min(br, maxCorner);
  bl = Math.min(bl, maxCorner);

  const top = tl + tr;
  const bottom = bl + br;
  const left = tl + bl;
  const right = tr + br;

  const scale = Math.min(
    1,
    top > 0 ? width / top : 1,
    bottom > 0 ? width / bottom : 1,
    left > 0 ? height / left : 1,
    right > 0 ? height / right : 1,
  );

  if (scale < 1) {
    tl *= scale;
    tr *= scale;
    br *= scale;
    bl *= scale;
  }

  return { tl, tr, br, bl };
}

export function rectToPath(
  width: number,
  height: number,
  cornerRadius: number | [number, number, number, number] = 0,
  cornerSmoothing = 0,
): string {
  const { tl, tr, br, bl } = normalizeCornerRadii(width, height, cornerRadius);

  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return `M0 0H${width}V${height}H0Z`;
  }

  const smoothing = Math.min(1, Math.max(0, clampToNonNegative(cornerSmoothing)));

  if (smoothing === 0) {
    return [
      `M${tl} 0`,
      `H${width - tr}`,
      tr > 0 ? `A${tr} ${tr} 0 0 1 ${width} ${tr}` : '',
      `V${height - br}`,
      br > 0 ? `A${br} ${br} 0 0 1 ${width - br} ${height}` : '',
      `H${bl}`,
      bl > 0 ? `A${bl} ${bl} 0 0 1 0 ${height - bl}` : '',
      `V${tl}`,
      tl > 0 ? `A${tl} ${tl} 0 0 1 ${tl} 0` : '',
      'Z',
    ]
      .filter(Boolean)
      .join('');
  }

  const controlFactor = CIRCLE_KAPPA + (MAX_SMOOTH_CONTROL_FACTOR - CIRCLE_KAPPA) * smoothing;
  const trControl = tr * controlFactor;
  const brControl = br * controlFactor;
  const blControl = bl * controlFactor;
  const tlControl = tl * controlFactor;

  return [
    `M${tl} 0`,
    `H${width - tr}`,
    tr > 0 ? `C${width - tr + trControl} 0 ${width} ${tr - trControl} ${width} ${tr}` : '',
    `V${height - br}`,
    br > 0
      ? `C${width} ${height - br + brControl} ${width - br + brControl} ${height} ${width - br} ${height}`
      : '',
    `H${bl}`,
    bl > 0 ? `C${bl - blControl} ${height} 0 ${height - bl + blControl} 0 ${height - bl}` : '',
    `V${tl}`,
    tl > 0 ? `C0 ${tl - tlControl} ${tl - tlControl} 0 ${tl} 0` : '',
    'Z',
  ]
    .filter(Boolean)
    .join('');
}

export function ellipseToPath(width: number, height: number): string {
  const rx = width / 2;
  const ry = height / 2;
  return [`M${rx} 0`, `A${rx} ${ry} 0 0 1 ${rx} ${height}`, `A${rx} ${ry} 0 0 1 ${rx} 0`, 'Z'].join(
    '',
  );
}

export function polygonToPath(width: number, height: number, sides: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: string[] = [];

  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    points.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
  }
  points.push('Z');
  return points.join('');
}

export function starToPath(
  width: number,
  height: number,
  numPoints: number,
  innerRadius: number,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const totalPoints = numPoints * 2;
  const points: string[] = [];

  for (let i = 0; i < totalPoints; i++) {
    const angle = (i * Math.PI) / numPoints - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const r = isOuter ? 1 : innerRadius;
    const x = cx + rx * r * Math.cos(angle);
    const y = cy + ry * r * Math.sin(angle);
    points.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
  }
  points.push('Z');
  return points.join('');
}

export function lineToPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1} ${y1}L${x2} ${y2}`;
}

function arrowheadPath(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  strokeWidth: number,
  type: ArrowheadType,
): string {
  if (type === 'none') return '';

  const sw = Math.max(strokeWidth, 1);
  const headLen = sw * 4 + 4;
  const halfSpread = Math.PI / 6;
  const angle = Math.atan2(tipY - fromY, tipX - fromX);

  switch (type) {
    case 'line_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return `M${lx} ${ly}L${tipX} ${tipY}L${rx} ${ry}`;
    }
    case 'triangle_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return `M${tipX} ${tipY}L${lx} ${ly}L${rx} ${ry}Z`;
    }
    case 'reversed_triangle': {
      const baseX = tipX + headLen * Math.cos(angle);
      const baseY = tipY + headLen * Math.sin(angle);
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return `M${baseX} ${baseY}L${lx} ${ly}L${rx} ${ry}Z`;
    }
    case 'circle_arrow': {
      const r = sw * 2.5 + 2;
      return `M${tipX + r} ${tipY}A${r} ${r} 0 1 0 ${tipX - r} ${tipY}A${r} ${r} 0 1 0 ${tipX + r} ${tipY}Z`;
    }
    case 'diamond_arrow': {
      const half = sw * 2.5 + 2;
      const cx = tipX - half * Math.cos(angle);
      const cy = tipY - half * Math.sin(angle);
      const backX = cx - half * Math.cos(angle);
      const backY = cy - half * Math.sin(angle);
      return `M${tipX} ${tipY}L${cx - half * Math.sin(angle)} ${cy + half * Math.cos(angle)}L${backX} ${backY}L${cx + half * Math.sin(angle)} ${cy - half * Math.cos(angle)}Z`;
    }
  }
}

export function arrowToPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
  startArrowhead: ArrowheadType,
  endArrowhead: ArrowheadType,
): string {
  const parts: string[] = [`M${x1} ${y1}L${x2} ${y2}`];

  const endPath = arrowheadPath(x2, y2, x1, y1, strokeWidth, endArrowhead);
  if (endPath) parts.push(endPath);

  const startPath = arrowheadPath(x1, y1, x2, y2, strokeWidth, startArrowhead);
  if (startPath) parts.push(startPath);

  return parts.join('');
}

export function transformPath(
  pathData: string,
  transform: { translateX?: number; translateY?: number; scaleX?: number; scaleY?: number },
): string {
  try {
    const commander = new SVGPathCommander(pathData);
    const tx = transform.translateX ?? 0;
    const ty = transform.translateY ?? 0;
    const sx = transform.scaleX ?? 1;
    const sy = transform.scaleY ?? 1;

    if (sx !== 1 || sy !== 1) {
      commander.transform({ scale: [sx, sy], origin: [0, 0] });
    }
    if (tx !== 0 || ty !== 0) {
      commander.transform({ translate: [tx, ty] });
    }
    return commander.toString();
  } catch {
    return pathData;
  }
}

export function getPathBounds(pathData: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  try {
    const bbox = SVGPathCommander.getPathBBox(pathData);
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function normalizePathToOrigin(pathData: string): {
  pathData: string;
  bounds: { x: number; y: number; width: number; height: number };
} {
  const bounds = getPathBounds(pathData);
  if (bounds.x === 0 && bounds.y === 0) {
    return { pathData, bounds };
  }
  try {
    const commander = new SVGPathCommander(pathData);
    commander.transform({ translate: [-bounds.x, -bounds.y] });
    return { pathData: commander.toString(), bounds };
  } catch {
    return { pathData, bounds };
  }
}
