import {
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  oklchToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToOklch,
} from './color-conversions';

export type ColorMode = 'hex' | 'rgb' | 'hsl' | 'hsb' | 'oklch' | 'css';

export const MODE_LABELS: Record<ColorMode, string> = {
  hex: 'Hex',
  rgb: 'RGB',
  hsl: 'HSL',
  hsb: 'HSB',
  oklch: 'OKLCH',
  css: 'CSS',
};

export const MODES: ColorMode[] = ['hex', 'rgb', 'hsl', 'hsb', 'oklch', 'css'];

export function parseCssColor(input: string): string | null {
  const result = detectAndParseColor(input);
  return result ? result.hex : null;
}

export function detectAndParseColor(input: string): { hex: string; mode: ColorMode } | null {
  const s = input.trim().toLowerCase();
  const SEP = /[\s,/]+/;

  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const r = s[1]! + s[1]!;
    const g = s[2]! + s[2]!;
    const b = s[3]! + s[3]!;
    return { hex: `#${r}${g}${b}`.toUpperCase(), mode: 'hex' };
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return { hex: s.toUpperCase(), mode: 'hex' };
  if (/^#[0-9a-f]{8}$/i.test(s)) return { hex: s.slice(0, 7).toUpperCase(), mode: 'hex' };

  const inner = s.match(/^(\w+)\(\s*(.+?)\s*\)$/);
  if (inner) {
    const fn = inner[1]!;
    const args = inner[2]!.replace(/%/g, '').split(SEP).filter(Boolean).map(Number);

    if ((fn === 'rgb' || fn === 'rgba') && args.length >= 3 && args.every((n) => !isNaN(n))) {
      return {
        hex: rgbToHex(args[0]!, args[1]!, args[2]!),
        mode: 'rgb',
      };
    }

    if ((fn === 'hsl' || fn === 'hsla') && args.length >= 3 && args.every((n) => !isNaN(n))) {
      const [r, g, b] = hslToRgb(args[0]!, args[1]!, args[2]!);
      return { hex: rgbToHex(r, g, b), mode: 'hsl' };
    }

    if (fn === 'oklch' && args.length >= 3 && args.every((n) => !isNaN(n))) {
      let lVal = args[0]!;
      const hasPercent = inner[2]!.includes('%');
      if (!hasPercent && lVal <= 1) lVal = lVal * 100;
      const [r, g, b] = oklchToRgb(lVal, args[1]!, args[2]!);
      return { hex: rgbToHex(r, g, b), mode: 'oklch' };
    }

    if (fn === 'hsb' && args.length >= 3 && args.every((n) => !isNaN(n))) {
      const [r, g, b] = hsvToRgb(args[0]! / 360, args[1]! / 100, args[2]! / 100);
      return { hex: rgbToHex(r, g, b), mode: 'hsb' };
    }
  }

  return null;
}

export function formatColorForMode(mode: ColorMode, hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  switch (mode) {
    case 'hex':
      return hex.replace('#', '').toUpperCase();
    case 'rgb':
      return `${r}, ${g}, ${b}`;
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      return `${h}, ${s}%, ${l}%`;
    }
    case 'hsb': {
      const hsv = rgbToHsv(r, g, b);
      return `${Math.round(hsv.h * 360)}, ${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`;
    }
    case 'oklch': {
      const [l, c, h] = rgbToOklch(r, g, b);
      return `${l}% ${c} ${h}`;
    }
    case 'css':
      return hex.toUpperCase();
    default:
      return hex.replace('#', '').toUpperCase();
  }
}

export function parseColorInput(mode: ColorMode, value: string): string | null {
  switch (mode) {
    case 'hex': {
      const clean = value.replace('#', '').toUpperCase();
      if (/^[0-9A-F]{6}$/.test(clean)) return `#${clean}`;
      if (/^[0-9A-F]{3}$/.test(clean)) {
        return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
      }
      return null;
    }
    case 'rgb': {
      const parts = value
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
        return rgbToHex(parts[0]!, parts[1]!, parts[2]!);
      }
      return null;
    }
    case 'hsl': {
      const parts = value
        .replace(/%/g, '')
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        const [r, g, b] = hslToRgb(parts[0]!, parts[1]!, parts[2]!);
        return rgbToHex(r, g, b);
      }
      return null;
    }
    case 'hsb': {
      const parts = value
        .replace(/%/g, '')
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        const [r, g, b] = hsvToRgb(parts[0]! / 360, parts[1]! / 100, parts[2]! / 100);
        return rgbToHex(r, g, b);
      }
      return null;
    }
    case 'oklch': {
      const parts = value
        .replace(/%/g, '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        const [r, g, b] = oklchToRgb(parts[0]!, parts[1]!, parts[2]!);
        return rgbToHex(r, g, b);
      }
      return null;
    }
    case 'css':
      return parseCssColor(value);
    default:
      return null;
  }
}
