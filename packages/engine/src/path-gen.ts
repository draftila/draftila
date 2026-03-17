import SVGPathCommander from 'svg-path-commander';

export function rectToPath(
  width: number,
  height: number,
  cornerRadius: number | [number, number, number, number] = 0,
): string {
  if ((Array.isArray(cornerRadius) && cornerRadius.every((r) => r === 0)) || cornerRadius === 0) {
    return `M0 0H${width}V${height}H0Z`;
  }

  let tl: number, tr: number, br: number, bl: number;
  if (Array.isArray(cornerRadius)) {
    [tl, tr, br, bl] = cornerRadius;
  } else {
    tl = tr = br = bl = cornerRadius;
  }

  const maxR = Math.min(width, height) / 2;
  tl = Math.min(tl, maxR);
  tr = Math.min(tr, maxR);
  br = Math.min(br, maxR);
  bl = Math.min(bl, maxR);

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

export function arrowToPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
  startArrowhead: boolean,
  endArrowhead: boolean,
): string {
  const parts: string[] = [`M${x1} ${y1}L${x2} ${y2}`];

  const headSize = Math.max(16, strokeWidth * 5);
  const headAngle = Math.PI / 6;

  if (endArrowhead) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const lx = x2 - headSize * Math.cos(angle - headAngle);
    const ly = y2 - headSize * Math.sin(angle - headAngle);
    const rx = x2 - headSize * Math.cos(angle + headAngle);
    const ry = y2 - headSize * Math.sin(angle + headAngle);
    parts.push(`M${lx} ${ly}L${x2} ${y2}L${rx} ${ry}`);
  }

  if (startArrowhead) {
    const angle = Math.atan2(y1 - y2, x1 - x2);
    const lx = x1 - headSize * Math.cos(angle - headAngle);
    const ly = y1 - headSize * Math.sin(angle - headAngle);
    const rx = x1 - headSize * Math.cos(angle + headAngle);
    const ry = y1 - headSize * Math.sin(angle + headAngle);
    parts.push(`M${lx} ${ly}L${x1} ${y1}L${rx} ${ry}`);
  }

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
