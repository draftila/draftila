import type { InterchangeStroke, InterchangeDashPattern } from '../interchange-format';

export interface RenderContext {
  defs: string[];
  defCounter: number;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function parseHexAlpha(color: string): { r: number; g: number; b: number; a: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (color.length >= 7) {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  }
  if (color.length > 7) {
    a = parseInt(color.slice(7, 9), 16) / 255;
  }
  return { r, g, b, a };
}

export function svgColor(hex: string, opacity: number): string {
  const { r, g, b, a } = parseHexAlpha(hex);
  const finalAlpha = a * opacity;
  if (finalAlpha <= 0) return 'transparent';
  if (finalAlpha >= 1) return hex.slice(0, 7);
  return `rgba(${r},${g},${b},${+finalAlpha.toFixed(4)})`;
}

export function dashPatternToSvg(pattern: InterchangeDashPattern, strokeWidth: number): string {
  switch (pattern) {
    case 'dash':
      return `${strokeWidth * 4},${strokeWidth * 2}`;
    case 'dot':
      return `${strokeWidth},${strokeWidth * 2}`;
    case 'dash-dot':
      return `${strokeWidth * 4},${strokeWidth * 2},${strokeWidth},${strokeWidth * 2}`;
    default:
      return '';
  }
}

export function resolveDashArraySvg(stroke: InterchangeStroke): string {
  if (stroke.dashArray && stroke.dashArray.length > 0) {
    return stroke.dashArray.join(',');
  }
  return dashPatternToSvg(stroke.dashPattern, stroke.width);
}

export function rectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): string {
  tl = Math.min(tl, w / 2, h / 2);
  tr = Math.min(tr, w / 2, h / 2);
  br = Math.min(br, w / 2, h / 2);
  bl = Math.min(bl, w / 2, h / 2);
  return [
    `M ${x + tl} ${y}`,
    `L ${x + w - tr} ${y}`,
    tr > 0 ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : '',
    `L ${x + w} ${y + h - br}`,
    br > 0 ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : '',
    `L ${x + bl} ${y + h}`,
    bl > 0 ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : '',
    `L ${x} ${y + tl}`,
    tl > 0 ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}
