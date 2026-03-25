import type { Stroke, StrokeDashPattern } from '@draftila/shared';

export function applyTextTransform(
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

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

export function truncateLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '\u2026';
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (ctx.measureText(text.slice(0, mid)).width + ellipsisWidth <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo === 0 ? ellipsis : text.slice(0, lo) + ellipsis;
}

export function resolveDashArray(stroke: Stroke): number[] {
  if (stroke.dashArray && stroke.dashArray.length > 0) {
    return stroke.dashArray;
  }
  return dashPatternToArray(stroke.dashPattern ?? 'solid', stroke.width);
}

export function dashPatternToArray(pattern: StrokeDashPattern, strokeWidth: number): number[] {
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

export function colorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  if (opacity <= 0) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function shadowColorToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
