import SVGPathCommander from 'svg-path-commander';
import { parseAttr } from './shared';
import { decomposeTransform } from './transforms';

export function getPathBBox(d: string): { x: number; y: number; width: number; height: number } {
  try {
    const bbox = SVGPathCommander.getPathBBox(d);
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function normalizePathData(d: string): {
  localD: string;
  bounds: { x: number; y: number; width: number; height: number };
} {
  const bounds = getPathBBox(d);
  if (bounds.width === 0 && bounds.height === 0) {
    return { localD: d, bounds };
  }

  try {
    const commander = new SVGPathCommander(d);
    commander.transform({ translate: [-bounds.x, -bounds.y] });
    return { localD: commander.toString(), bounds };
  } catch {
    return { localD: d, bounds };
  }
}

export function elementToPathData(el: Element): string | null {
  const tagName = el.tagName.toLowerCase();

  switch (tagName) {
    case 'path': {
      return el.getAttribute('d');
    }
    case 'rect': {
      const x = parseAttr(el, 'x');
      const y = parseAttr(el, 'y');
      const w = parseAttr(el, 'width', 0);
      const h = parseAttr(el, 'height', 0);
      const rx = Math.min(parseAttr(el, 'rx'), w / 2);
      const ry = Math.min(parseAttr(el, 'ry', rx), h / 2);

      if (w <= 0 || h <= 0) return null;

      if (rx <= 0 && ry <= 0) {
        return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      }

      const r = Math.max(rx, ry);
      return [
        `M${x + r} ${y}`,
        `H${x + w - r}`,
        `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
        `V${y + h - r}`,
        `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
        `H${x + r}`,
        `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
        `V${y + r}`,
        `A${r} ${r} 0 0 1 ${x + r} ${y}`,
        'Z',
      ].join('');
    }
    case 'circle': {
      const cx = parseAttr(el, 'cx');
      const cy = parseAttr(el, 'cy');
      const r = parseAttr(el, 'r');
      if (r <= 0) return null;
      return [
        `M${cx - r} ${cy}`,
        `A${r} ${r} 0 0 1 ${cx + r} ${cy}`,
        `A${r} ${r} 0 0 1 ${cx - r} ${cy}`,
        'Z',
      ].join('');
    }
    case 'ellipse': {
      const cx = parseAttr(el, 'cx');
      const cy = parseAttr(el, 'cy');
      const rx = parseAttr(el, 'rx');
      const ry = parseAttr(el, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return [
        `M${cx - rx} ${cy}`,
        `A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`,
        `A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`,
        'Z',
      ].join('');
    }
    case 'line': {
      const x1 = parseAttr(el, 'x1');
      const y1 = parseAttr(el, 'y1');
      const x2 = parseAttr(el, 'x2');
      const y2 = parseAttr(el, 'y2');
      return `M${x1} ${y1}L${x2} ${y2}`;
    }
    case 'polyline':
    case 'polygon': {
      const points = el.getAttribute('points');
      if (!points) return null;
      const coords = points
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (coords.length < 4) return null;
      const parts: string[] = [];
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i]!;
        const y = coords[i + 1];
        if (y === undefined) break;
        parts.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
      }
      if (tagName === 'polygon') parts.push('Z');
      return parts.join('');
    }
    default:
      return null;
  }
}

export function transformPathWithMatrix(pathData: string, matrix: DOMMatrix): string {
  try {
    const segments = SVGPathCommander.parsePathString(pathData);
    const transformed: string[] = [];

    let cx = 0;
    let cy = 0;

    for (const seg of segments) {
      const cmd = seg[0] as string;

      switch (cmd) {
        case 'M':
        case 'L': {
          const pt = matrix.transformPoint({ x: seg[1] as number, y: seg[2] as number });
          transformed.push(`${cmd}${pt.x} ${pt.y}`);
          cx = seg[1] as number;
          cy = seg[2] as number;
          break;
        }
        case 'H': {
          const pt = matrix.transformPoint({ x: seg[1] as number, y: cy });
          transformed.push(`L${pt.x} ${pt.y}`);
          cx = seg[1] as number;
          break;
        }
        case 'V': {
          const pt = matrix.transformPoint({ x: cx, y: seg[1] as number });
          transformed.push(`L${pt.x} ${pt.y}`);
          cy = seg[1] as number;
          break;
        }
        case 'C': {
          const p1 = matrix.transformPoint({ x: seg[1] as number, y: seg[2] as number });
          const p2 = matrix.transformPoint({ x: seg[3] as number, y: seg[4] as number });
          const p3 = matrix.transformPoint({ x: seg[5] as number, y: seg[6] as number });
          transformed.push(`C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
          cx = seg[5] as number;
          cy = seg[6] as number;
          break;
        }
        case 'Q': {
          const qp1 = matrix.transformPoint({ x: seg[1] as number, y: seg[2] as number });
          const qp2 = matrix.transformPoint({ x: seg[3] as number, y: seg[4] as number });
          transformed.push(`Q${qp1.x} ${qp1.y} ${qp2.x} ${qp2.y}`);
          cx = seg[3] as number;
          cy = seg[4] as number;
          break;
        }
        case 'A': {
          const rx = seg[1] as number;
          const ry = seg[2] as number;
          const angle = seg[3] as number;
          const largeArc = seg[4] as number;
          const sweep = seg[5] as number;
          const endPt = matrix.transformPoint({ x: seg[6] as number, y: seg[7] as number });
          const { sx, sy } = decomposeTransform(matrix);
          transformed.push(
            `A${rx * sx} ${ry * sy} ${angle} ${largeArc} ${sweep} ${endPt.x} ${endPt.y}`,
          );
          cx = seg[6] as number;
          cy = seg[7] as number;
          break;
        }
        case 'Z':
        case 'z': {
          transformed.push('Z');
          break;
        }
        default: {
          transformed.push(seg.join(' '));
          break;
        }
      }
    }

    return transformed.join('');
  } catch {
    return pathData;
  }
}
