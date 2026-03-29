import type { Fill, Stroke, Shadow, Blur, Shape } from '@draftila/shared';
import type { ShapeTreeNode } from './types';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string, opacity = 1): Rgba {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const hexAlpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return { r, g, b, a: roundTo(hexAlpha * opacity, 3) };
}

export function rgbaToCssColor(rgba: Rgba): string {
  if (rgba.a >= 1) {
    return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
  }
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sanitizeName(name: string, fallbackType: string): string {
  const base = name.trim() || fallbackType;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizeSwiftName(name: string, fallbackType: string): string {
  const base = name.trim() || fallbackType;
  return base
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export function sanitizeComposeName(name: string, fallbackType: string): string {
  const base = name.trim() || fallbackType;
  return base
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export function getVisibleFills(fills: Fill[]): Fill[] {
  return fills.filter((f) => f.visible);
}

export function getVisibleStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.filter((s) => s.visible);
}

export function getVisibleShadows(shadows: Shadow[]): Shadow[] {
  return shadows.filter((s) => s.visible);
}

export function getVisibleBlurs(blurs: Blur[]): Blur[] {
  return blurs.filter((b) => b.visible);
}

export function getEffectiveCornerRadii(shape: Shape): {
  tl: number;
  tr: number;
  br: number;
  bl: number;
} | null {
  if (shape.type !== 'rectangle' && shape.type !== 'frame') return null;
  const s = shape;
  const uniform = 'cornerRadius' in s ? (s.cornerRadius ?? 0) : 0;
  const tl = ('cornerRadiusTL' in s ? s.cornerRadiusTL : undefined) ?? uniform;
  const tr = ('cornerRadiusTR' in s ? s.cornerRadiusTR : undefined) ?? uniform;
  const br = ('cornerRadiusBR' in s ? s.cornerRadiusBR : undefined) ?? uniform;
  const bl = ('cornerRadiusBL' in s ? s.cornerRadiusBL : undefined) ?? uniform;
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) return null;
  return { tl, tr, br, bl };
}

export function buildShapeTree(shapes: Shape[]): ShapeTreeNode[] {
  const shapeMap = new Map<string, Shape>();
  const childrenMap = new Map<string | null, Shape[]>();

  for (const shape of shapes) {
    shapeMap.set(shape.id, shape);
    const parentKey = shape.parentId ?? null;
    let list = childrenMap.get(parentKey);
    if (!list) {
      list = [];
      childrenMap.set(parentKey, list);
    }
    list.push(shape);
  }

  function buildNode(shape: Shape): ShapeTreeNode {
    const kids = childrenMap.get(shape.id) ?? [];
    return {
      shape,
      children: kids.map(buildNode),
    };
  }

  const topLevel = childrenMap.get(null) ?? [];
  const shapeIds = new Set(shapes.map((s) => s.id));
  const orphans = shapes.filter((s) => s.parentId && !shapeIds.has(s.parentId));

  return [...topLevel, ...orphans].map(buildNode);
}

export function indent(text: string, level: number): string {
  const prefix = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : line))
    .join('\n');
}

export function deduplicateNames(names: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  const result = new Map<string, string>();

  for (const name of names) {
    const count = counts.get(name) ?? 0;
    counts.set(name, count + 1);
    result.set(name, count > 0 ? `${name}-${count + 1}` : name);
  }

  return result;
}
