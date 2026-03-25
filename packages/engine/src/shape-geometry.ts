import type { ArrowheadType } from '@draftila/shared';

export function getCornerRadii(shape: {
  cornerRadius: number;
  cornerRadiusTL?: number;
  cornerRadiusTR?: number;
  cornerRadiusBL?: number;
  cornerRadiusBR?: number;
}): number | [number, number, number, number] {
  const hasIndependentCorners =
    shape.cornerRadiusTL !== undefined ||
    shape.cornerRadiusTR !== undefined ||
    shape.cornerRadiusBL !== undefined ||
    shape.cornerRadiusBR !== undefined;
  return hasIndependentCorners
    ? [
        shape.cornerRadiusTL ?? shape.cornerRadius,
        shape.cornerRadiusTR ?? shape.cornerRadius,
        shape.cornerRadiusBR ?? shape.cornerRadius,
        shape.cornerRadiusBL ?? shape.cornerRadius,
      ]
    : shape.cornerRadius;
}

export function generatePolygonPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sides: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return points;
}

export function generateStarPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  numPoints: number,
  innerRadius: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const totalPoints = numPoints * 2;
  for (let i = 0; i < totalPoints; i++) {
    const angle = (i * Math.PI) / numPoints - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const r = isOuter ? 1 : innerRadius;
    points.push([cx + rx * r * Math.cos(angle), cy + ry * r * Math.sin(angle)]);
  }
  return points;
}

export interface ArrowheadGeometry {
  points: Array<[number, number]>;
  closed: boolean;
}

export function computeArrowheadGeometry(
  tipX: number,
  tipY: number,
  tailX: number,
  tailY: number,
  strokeWidth: number,
  type: ArrowheadType,
): ArrowheadGeometry | null {
  if (type === 'none') return null;

  const sw = Math.max(strokeWidth, 1);
  const headLen = sw * 4 + 4;
  const halfSpread = Math.PI / 6;
  const angle = Math.atan2(tipY - tailY, tipX - tailX);

  switch (type) {
    case 'line_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return {
        points: [
          [lx, ly],
          [tipX, tipY],
          [rx, ry],
        ],
        closed: false,
      };
    }
    case 'triangle_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return {
        points: [
          [tipX, tipY],
          [lx, ly],
          [rx, ry],
        ],
        closed: true,
      };
    }
    case 'reversed_triangle': {
      const baseX = tipX + headLen * Math.cos(angle);
      const baseY = tipY + headLen * Math.sin(angle);
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return {
        points: [
          [baseX, baseY],
          [lx, ly],
          [rx, ry],
        ],
        closed: true,
      };
    }
    case 'circle_arrow': {
      const r = sw * 2.5 + 2;
      const segments = 32;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push([tipX + r * Math.cos(a), tipY + r * Math.sin(a)]);
      }
      return { points: pts, closed: true };
    }
    case 'diamond_arrow': {
      const half = sw * 2.5 + 2;
      const cx = tipX - half * Math.cos(angle);
      const cy = tipY - half * Math.sin(angle);
      const backX = cx - half * Math.cos(angle);
      const backY = cy - half * Math.sin(angle);
      return {
        points: [
          [tipX, tipY],
          [cx - half * Math.sin(angle), cy + half * Math.cos(angle)],
          [backX, backY],
          [cx + half * Math.sin(angle), cy - half * Math.cos(angle)],
        ],
        closed: true,
      };
    }
  }
}
