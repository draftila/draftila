export const FONT_SIZE_MAP: Record<number, string> = {
  12: 'text-xs',
  14: 'text-sm',
  16: 'text-base',
  18: 'text-lg',
  20: 'text-xl',
  24: 'text-2xl',
  30: 'text-3xl',
  36: 'text-4xl',
  48: 'text-5xl',
  60: 'text-6xl',
  72: 'text-7xl',
  96: 'text-8xl',
  128: 'text-9xl',
};

export const BORDER_RADIUS_MAP: Record<number, string> = {
  2: 'rounded-sm',
  4: 'rounded',
  6: 'rounded-md',
  8: 'rounded-lg',
  12: 'rounded-xl',
  16: 'rounded-2xl',
  24: 'rounded-3xl',
};

export const BORDER_WIDTH_MAP: Record<number, string> = {
  0: '0',
  1: '',
  2: '2',
  4: '4',
  8: '8',
};

export const BLUR_MAP: Record<number, string> = {
  0: 'blur-none',
  4: 'blur-xs',
  8: 'blur-sm',
  12: 'blur-md',
  16: 'blur-lg',
  24: 'blur-xl',
  40: 'blur-2xl',
  64: 'blur-3xl',
};

export const BACKDROP_BLUR_MAP: Record<number, string> = {
  0: 'backdrop-blur-none',
  4: 'backdrop-blur-xs',
  8: 'backdrop-blur-sm',
  12: 'backdrop-blur-md',
  16: 'backdrop-blur-lg',
  24: 'backdrop-blur-xl',
  40: 'backdrop-blur-2xl',
  64: 'backdrop-blur-3xl',
};

export const LEADING_MAP: Record<number, string> = {
  1: 'leading-none',
  1.25: 'leading-tight',
  1.375: 'leading-snug',
  1.5: 'leading-normal',
  1.625: 'leading-relaxed',
  2: 'leading-loose',
};

export const FONT_WEIGHT_MAP: Record<number, string> = {
  100: 'font-thin',
  200: 'font-extralight',
  300: 'font-light',
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
  800: 'font-extrabold',
  900: 'font-black',
};

export function invertNumericMap(map: Record<number, string>): Record<string, number> {
  const inverted: Record<string, number> = {};
  for (const [value, token] of Object.entries(map)) {
    inverted[token] = Number(value);
  }
  return inverted;
}

const SPACING_SPECIALS: Record<string, number> = {
  px: 1,
  '0.5': 2,
  '1.5': 6,
  '2.5': 10,
  '3.5': 14,
};

export function spacingPxFromToken(token: string): number | null {
  const special = SPACING_SPECIALS[token];
  if (special !== undefined) return special;
  const numeric = Number(token);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric * 4;
}

export interface ShadowPreset {
  type: 'drop' | 'inner';
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

export const SHADOW_PRESETS: Record<string, ShadowPreset[]> = {
  '2xs': [{ type: 'drop', x: 0, y: 1, blur: 0, spread: 0, color: '#0000000d' }],
  xs: [{ type: 'drop', x: 0, y: 1, blur: 2, spread: 0, color: '#0000000d' }],
  sm: [
    { type: 'drop', x: 0, y: 1, blur: 3, spread: 0, color: '#0000001a' },
    { type: 'drop', x: 0, y: 1, blur: 2, spread: -1, color: '#0000001a' },
  ],
  '': [
    { type: 'drop', x: 0, y: 1, blur: 3, spread: 0, color: '#0000001a' },
    { type: 'drop', x: 0, y: 1, blur: 2, spread: -1, color: '#0000001a' },
  ],
  md: [
    { type: 'drop', x: 0, y: 4, blur: 6, spread: -1, color: '#0000001a' },
    { type: 'drop', x: 0, y: 2, blur: 4, spread: -2, color: '#0000001a' },
  ],
  lg: [
    { type: 'drop', x: 0, y: 10, blur: 15, spread: -3, color: '#0000001a' },
    { type: 'drop', x: 0, y: 4, blur: 6, spread: -4, color: '#0000001a' },
  ],
  xl: [
    { type: 'drop', x: 0, y: 20, blur: 25, spread: -5, color: '#0000001a' },
    { type: 'drop', x: 0, y: 8, blur: 10, spread: -6, color: '#0000001a' },
  ],
  '2xl': [{ type: 'drop', x: 0, y: 25, blur: 50, spread: -12, color: '#00000040' }],
  inner: [{ type: 'inner', x: 0, y: 2, blur: 4, spread: 0, color: '#0000000d' }],
};

const PALETTE: Record<
  string,
  [string, string, string, string, string, string, string, string, string, string, string]
> = {
  slate: [
    '#f8fafc',
    '#f1f5f9',
    '#e2e8f0',
    '#cbd5e1',
    '#94a3b8',
    '#64748b',
    '#475569',
    '#334155',
    '#1e293b',
    '#0f172a',
    '#020617',
  ],
  gray: [
    '#f9fafb',
    '#f3f4f6',
    '#e5e7eb',
    '#d1d5db',
    '#9ca3af',
    '#6b7280',
    '#4b5563',
    '#374151',
    '#1f2937',
    '#111827',
    '#030712',
  ],
  zinc: [
    '#fafafa',
    '#f4f4f5',
    '#e4e4e7',
    '#d4d4d8',
    '#a1a1aa',
    '#71717a',
    '#52525b',
    '#3f3f46',
    '#27272a',
    '#18181b',
    '#09090b',
  ],
  neutral: [
    '#fafafa',
    '#f5f5f5',
    '#e5e5e5',
    '#d4d4d4',
    '#a3a3a3',
    '#737373',
    '#525252',
    '#404040',
    '#262626',
    '#171717',
    '#0a0a0a',
  ],
  stone: [
    '#fafaf9',
    '#f5f5f4',
    '#e7e5e4',
    '#d6d3d1',
    '#a8a29e',
    '#78716c',
    '#57534e',
    '#44403c',
    '#292524',
    '#1c1917',
    '#0c0a09',
  ],
  red: [
    '#fef2f2',
    '#fee2e2',
    '#fecaca',
    '#fca5a5',
    '#f87171',
    '#ef4444',
    '#dc2626',
    '#b91c1c',
    '#991b1b',
    '#7f1d1d',
    '#450a0a',
  ],
  orange: [
    '#fff7ed',
    '#ffedd5',
    '#fed7aa',
    '#fdba74',
    '#fb923c',
    '#f97316',
    '#ea580c',
    '#c2410c',
    '#9a3412',
    '#7c2d12',
    '#431407',
  ],
  amber: [
    '#fffbeb',
    '#fef3c7',
    '#fde68a',
    '#fcd34d',
    '#fbbf24',
    '#f59e0b',
    '#d97706',
    '#b45309',
    '#92400e',
    '#78350f',
    '#451a03',
  ],
  yellow: [
    '#fefce8',
    '#fef9c3',
    '#fef08a',
    '#fde047',
    '#facc15',
    '#eab308',
    '#ca8a04',
    '#a16207',
    '#854d0e',
    '#713f12',
    '#422006',
  ],
  lime: [
    '#f7fee7',
    '#ecfccb',
    '#d9f99d',
    '#bef264',
    '#a3e635',
    '#84cc16',
    '#65a30d',
    '#4d7c0f',
    '#3f6212',
    '#365314',
    '#1a2e05',
  ],
  green: [
    '#f0fdf4',
    '#dcfce7',
    '#bbf7d0',
    '#86efac',
    '#4ade80',
    '#22c55e',
    '#16a34a',
    '#15803d',
    '#166534',
    '#14532d',
    '#052e16',
  ],
  emerald: [
    '#ecfdf5',
    '#d1fae5',
    '#a7f3d0',
    '#6ee7b7',
    '#34d399',
    '#10b981',
    '#059669',
    '#047857',
    '#065f46',
    '#064e3b',
    '#022c22',
  ],
  teal: [
    '#f0fdfa',
    '#ccfbf1',
    '#99f6e4',
    '#5eead4',
    '#2dd4bf',
    '#14b8a6',
    '#0d9488',
    '#0f766e',
    '#115e59',
    '#134e4a',
    '#042f2e',
  ],
  cyan: [
    '#ecfeff',
    '#cffafe',
    '#a5f3fc',
    '#67e8f9',
    '#22d3ee',
    '#06b6d4',
    '#0891b2',
    '#0e7490',
    '#155e75',
    '#164e63',
    '#083344',
  ],
  sky: [
    '#f0f9ff',
    '#e0f2fe',
    '#bae6fd',
    '#7dd3fc',
    '#38bdf8',
    '#0ea5e9',
    '#0284c7',
    '#0369a1',
    '#075985',
    '#0c4a6e',
    '#082f49',
  ],
  blue: [
    '#eff6ff',
    '#dbeafe',
    '#bfdbfe',
    '#93c5fd',
    '#60a5fa',
    '#3b82f6',
    '#2563eb',
    '#1d4ed8',
    '#1e40af',
    '#1e3a8a',
    '#172554',
  ],
  indigo: [
    '#eef2ff',
    '#e0e7ff',
    '#c7d2fe',
    '#a5b4fc',
    '#818cf8',
    '#6366f1',
    '#4f46e5',
    '#4338ca',
    '#3730a3',
    '#312e81',
    '#1e1b4b',
  ],
  violet: [
    '#f5f3ff',
    '#ede9fe',
    '#ddd6fe',
    '#c4b5fd',
    '#a78bfa',
    '#8b5cf6',
    '#7c3aed',
    '#6d28d9',
    '#5b21b6',
    '#4c1d95',
    '#2e1065',
  ],
  purple: [
    '#faf5ff',
    '#f3e8ff',
    '#e9d5ff',
    '#d8b4fe',
    '#c084fc',
    '#a855f7',
    '#9333ea',
    '#7e22ce',
    '#6b21a8',
    '#581c87',
    '#3b0764',
  ],
  fuchsia: [
    '#fdf4ff',
    '#fae8ff',
    '#f5d0fe',
    '#f0abfc',
    '#e879f9',
    '#d946ef',
    '#c026d3',
    '#a21caf',
    '#86198f',
    '#701a75',
    '#4a044e',
  ],
  pink: [
    '#fdf2f8',
    '#fce7f3',
    '#fbcfe8',
    '#f9a8d4',
    '#f472b6',
    '#ec4899',
    '#db2777',
    '#be185d',
    '#9d174d',
    '#831843',
    '#500724',
  ],
  rose: [
    '#fff1f2',
    '#ffe4e6',
    '#fecdd3',
    '#fda4af',
    '#fb7185',
    '#f43f5e',
    '#e11d48',
    '#be123c',
    '#9f1239',
    '#881337',
    '#4c0519',
  ],
};

const SHADE_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

function buildTailwindColors(): Record<string, string> {
  const colors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
  };
  for (const [hue, shades] of Object.entries(PALETTE)) {
    shades.forEach((hex, index) => {
      colors[`${hue}-${SHADE_KEYS[index]}`] = hex;
    });
  }
  return colors;
}

export const TAILWIND_COLORS: Record<string, string> = buildTailwindColors();
