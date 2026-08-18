import {
  FONT_SIZE_MAP,
  BORDER_RADIUS_MAP,
  BLUR_MAP,
  BACKDROP_BLUR_MAP,
  LEADING_MAP,
  FONT_WEIGHT_MAP,
  SHADOW_PRESETS,
  TAILWIND_COLORS,
  invertNumericMap,
  spacingPxFromToken,
  type ShadowPreset,
} from '../../codegen/tailwind-maps';

export interface TailwindGradient {
  angle: number;
  from?: string;
  via?: string;
  to?: string;
}

export interface TailwindStyle {
  display?: 'flex' | 'block' | 'hidden';
  flexDirection?: 'row' | 'col';
  flexWrap?: boolean;
  gap?: number;
  gapX?: number;
  gapY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  justifyContent?: 'start' | 'center' | 'end' | 'space_between' | 'space_around';
  width?: number;
  widthFull?: boolean;
  widthAuto?: boolean;
  height?: number;
  heightFull?: boolean;
  heightAuto?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flexGrow?: boolean;
  selfStretch?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  gradient?: TailwindGradient;
  textColor?: string;
  textOpacity?: number;
  fontSize?: number;
  fontWeight?: number;
  fontItalic?: boolean;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  letterSpacingEm?: number;
  textAlign?: 'left' | 'center' | 'right';
  textDecoration?: 'none' | 'underline' | 'strikethrough';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  truncate?: boolean;
  borderWidth?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderColor?: string;
  borderDash?: 'dash' | 'dot';
  cornerRadius?: number;
  cornerRadiusTL?: number;
  cornerRadiusTR?: number;
  cornerRadiusBR?: number;
  cornerRadiusBL?: number;
  roundedFull?: boolean;
  shadows?: ShadowPreset[];
  opacity?: number;
  clip?: boolean;
  position?: 'relative' | 'absolute';
  left?: number;
  top?: number;
  objectFit?: 'fill' | 'fit' | 'crop';
  blurRadius?: number;
  backdropBlurRadius?: number;
  hidden?: boolean;
}

export interface TailwindParseResult {
  style: TailwindStyle;
  warnings: string[];
  unknown: string[];
}

const FONT_SIZE_BY_TOKEN = invertNumericMap(FONT_SIZE_MAP);
const RADIUS_BY_TOKEN = invertNumericMap(BORDER_RADIUS_MAP);
const LEADING_BY_TOKEN = invertNumericMap(LEADING_MAP);
const FONT_WEIGHT_BY_TOKEN = invertNumericMap(FONT_WEIGHT_MAP);
const BLUR_BY_TOKEN = invertNumericMap(BLUR_MAP);
const BACKDROP_BLUR_BY_TOKEN = invertNumericMap(BACKDROP_BLUR_MAP);

const RESPONSIVE_PREFIXES = new Set(['sm', 'md', 'lg', 'xl', '2xl', 'max-sm', 'max-md', 'max-lg']);

const MAX_WIDTH_PRESETS: Record<string, number> = {
  xs: 320,
  sm: 384,
  md: 448,
  lg: 512,
  xl: 576,
  '2xl': 672,
  '3xl': 768,
  '4xl': 896,
  '5xl': 1024,
  '6xl': 1152,
  '7xl': 1280,
};

const TRACKING_EM: Record<string, number> = {
  tighter: -0.05,
  tight: -0.025,
  normal: 0,
  wide: 0.025,
  wider: 0.05,
  widest: 0.1,
};

const GRADIENT_DIRECTION_ANGLES: Record<string, number> = {
  t: -90,
  tr: -45,
  r: 0,
  br: 45,
  b: 90,
  bl: 135,
  l: 180,
  tl: 225,
};

const SILENT_PREFIXES = [
  'z-',
  'transition',
  'duration-',
  'ease-',
  'delay-',
  'animate-',
  'cursor-',
  'select-',
  'pointer-events-',
  'whitespace-',
  'shrink',
  'antialiased',
  'subpixel-antialiased',
  'outline-none',
  'appearance-',
  'will-change-',
  'scroll-',
  'snap-',
  'decoration-',
  'underline-offset-',
  'list-',
  'accent-',
  'caret-',
  'placeholder-',
  'aspect-',
];

function expandShortHex(hex: string): string {
  if (/^#[0-9a-fA-F]{3,4}$/.test(hex)) {
    const digits = hex.slice(1);
    return `#${[...digits].map((d) => d + d).join('')}`;
  }
  return hex;
}

function rgbToHex(value: string): string | null {
  const match = value.match(
    /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/,
  );
  if (!match) return null;
  const toHexByte = (raw: string) =>
    Math.max(0, Math.min(255, Number(raw)))
      .toString(16)
      .padStart(2, '0');
  let hex = `#${toHexByte(match[1]!)}${toHexByte(match[2]!)}${toHexByte(match[3]!)}`;
  if (match[4] !== undefined) {
    const alphaRaw = match[4];
    const alpha = alphaRaw.endsWith('%') ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
    hex += Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, '0');
  }
  return hex;
}

export function cssColorToHex(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === 'transparent') return 'transparent';
  if (trimmed.startsWith('#')) return expandShortHex(trimmed);
  return rgbToHex(trimmed);
}

export function resolveColorToken(token: string): { color: string; opacity?: number } | null {
  let value = token;
  let opacity: number | undefined;
  const slashIndex = value.lastIndexOf('/');
  if (slashIndex > 0 && !value.includes('[')) {
    const pct = Number(value.slice(slashIndex + 1));
    if (Number.isFinite(pct)) {
      opacity = Math.max(0, Math.min(1, pct / 100));
      value = value.slice(0, slashIndex);
    }
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).replaceAll('_', ' ');
    const innerSlash = inner.lastIndexOf('/');
    let colorPart = inner;
    if (innerSlash > 0 && /^\d+$/.test(inner.slice(innerSlash + 1))) {
      opacity = Math.max(0, Math.min(1, Number(inner.slice(innerSlash + 1)) / 100));
      colorPart = inner.slice(0, innerSlash);
    }
    if (colorPart.startsWith('#')) {
      return { color: expandShortHex(colorPart), opacity };
    }
    const rgb = rgbToHex(colorPart);
    if (rgb) return { color: rgb, opacity };
    return null;
  }

  const named = TAILWIND_COLORS[value];
  if (named) return { color: named, opacity };
  return null;
}

function parseArbitraryPx(value: string): number | null {
  const match = value.match(/^\[(-?[\d.]+)(px|rem)?\]$/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  return match[2] === 'rem' ? numeric * 16 : numeric;
}

function spacingFromSuffix(suffix: string): number | null {
  const arbitrary = parseArbitraryPx(suffix);
  if (arbitrary !== null) return arbitrary;
  return spacingPxFromToken(suffix);
}

function sizeFromSuffix(suffix: string): number | null {
  return spacingFromSuffix(suffix);
}

export function parseTailwindClasses(classAttr: string): TailwindParseResult {
  const style: TailwindStyle = {};
  const warnings: string[] = [];
  const unknown: string[] = [];
  const tokens = classAttr.split(/\s+/).filter((token) => token.length > 0);

  for (const token of tokens) {
    const colonIndex = indexOfVariantColon(token);
    if (colonIndex > 0) {
      const prefix = token.slice(0, colonIndex);
      if (RESPONSIVE_PREFIXES.has(prefix)) {
        warnings.push(`responsive variant "${token}" ignored (base classes only)`);
      } else {
        warnings.push(`state variant "${token}" ignored`);
      }
      continue;
    }
    if (!applyClass(token, style, warnings)) {
      if (!SILENT_PREFIXES.some((silent) => token === silent || token.startsWith(silent))) {
        unknown.push(token);
      }
    }
  }

  return { style, warnings, unknown };
}

function indexOfVariantColon(token: string): number {
  let depth = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === '[') depth++;
    else if (char === ']') depth--;
    else if (char === ':' && depth === 0) return i;
  }
  return -1;
}

function applyClass(token: string, style: TailwindStyle, warnings: string[]): boolean {
  switch (token) {
    case 'flex':
    case 'inline-flex':
      style.display = 'flex';
      return true;
    case 'grid':
    case 'inline-grid':
      style.display = 'flex';
      style.flexDirection = style.flexDirection ?? 'col';
      warnings.push('grid layout approximated as a vertical stack');
      return true;
    case 'block':
    case 'inline-block':
    case 'inline':
      style.display = 'block';
      return true;
    case 'hidden':
      style.hidden = true;
      return true;
    case 'flex-row':
      style.flexDirection = 'row';
      return true;
    case 'flex-col':
      style.flexDirection = 'col';
      return true;
    case 'flex-row-reverse':
      style.flexDirection = 'row';
      warnings.push('flex-row-reverse approximated as flex-row');
      return true;
    case 'flex-col-reverse':
      style.flexDirection = 'col';
      warnings.push('flex-col-reverse approximated as flex-col');
      return true;
    case 'flex-wrap':
      style.flexWrap = true;
      return true;
    case 'flex-nowrap':
      style.flexWrap = false;
      return true;
    case 'items-start':
      style.alignItems = 'start';
      return true;
    case 'items-center':
      style.alignItems = 'center';
      return true;
    case 'items-end':
      style.alignItems = 'end';
      return true;
    case 'items-stretch':
      style.alignItems = 'stretch';
      return true;
    case 'items-baseline':
      style.alignItems = 'start';
      warnings.push('items-baseline approximated as items-start');
      return true;
    case 'justify-start':
      style.justifyContent = 'start';
      return true;
    case 'justify-center':
      style.justifyContent = 'center';
      return true;
    case 'justify-end':
      style.justifyContent = 'end';
      return true;
    case 'justify-between':
      style.justifyContent = 'space_between';
      return true;
    case 'justify-around':
      style.justifyContent = 'space_around';
      return true;
    case 'justify-evenly':
      style.justifyContent = 'space_around';
      warnings.push('justify-evenly approximated as justify-around');
      return true;
    case 'flex-1':
    case 'grow':
    case 'flex-auto':
      style.flexGrow = true;
      return true;
    case 'grow-0':
    case 'flex-none':
    case 'flex-initial':
      style.flexGrow = false;
      return true;
    case 'self-stretch':
      style.selfStretch = true;
      return true;
    case 'self-start':
    case 'self-center':
    case 'self-end':
    case 'self-auto':
    case 'self-baseline':
      warnings.push(`"${token}" ignored (per-child cross-axis alignment is not supported)`);
      return true;
    case 'w-full':
      style.widthFull = true;
      return true;
    case 'w-auto':
      style.widthAuto = true;
      return true;
    case 'w-screen':
      style.widthFull = true;
      warnings.push('w-screen approximated as w-full');
      return true;
    case 'h-full':
      style.heightFull = true;
      return true;
    case 'h-auto':
      style.heightAuto = true;
      return true;
    case 'h-screen':
      style.heightFull = true;
      warnings.push('h-screen approximated as h-full');
      return true;
    case 'italic':
      style.fontItalic = true;
      return true;
    case 'not-italic':
      style.fontItalic = false;
      return true;
    case 'underline':
      style.textDecoration = 'underline';
      return true;
    case 'line-through':
      style.textDecoration = 'strikethrough';
      return true;
    case 'no-underline':
      style.textDecoration = 'none';
      return true;
    case 'uppercase':
      style.textTransform = 'uppercase';
      return true;
    case 'lowercase':
      style.textTransform = 'lowercase';
      return true;
    case 'capitalize':
      style.textTransform = 'capitalize';
      return true;
    case 'normal-case':
      style.textTransform = 'none';
      return true;
    case 'truncate':
      style.truncate = true;
      return true;
    case 'text-left':
      style.textAlign = 'left';
      return true;
    case 'text-center':
      style.textAlign = 'center';
      return true;
    case 'text-right':
      style.textAlign = 'right';
      return true;
    case 'text-justify':
      style.textAlign = 'left';
      warnings.push('text-justify approximated as text-left');
      return true;
    case 'font-sans':
      return true;
    case 'font-serif':
      style.fontFamily = 'serif';
      return true;
    case 'font-mono':
      style.fontFamily = 'monospace';
      return true;
    case 'rounded-full':
      style.roundedFull = true;
      return true;
    case 'overflow-hidden':
    case 'overflow-clip':
    case 'overflow-auto':
    case 'overflow-scroll':
    case 'overflow-x-hidden':
    case 'overflow-y-hidden':
      style.clip = true;
      return true;
    case 'overflow-visible':
      style.clip = false;
      return true;
    case 'relative':
      style.position = 'relative';
      return true;
    case 'absolute':
      style.position = 'absolute';
      return true;
    case 'fixed':
    case 'sticky':
      style.position = 'absolute';
      warnings.push(`"${token}" positioning approximated as absolute`);
      return true;
    case 'object-cover':
      style.objectFit = 'crop';
      return true;
    case 'object-contain':
      style.objectFit = 'fit';
      return true;
    case 'object-fill':
      style.objectFit = 'fill';
      return true;
    case 'border':
      style.borderWidth = 1;
      return true;
    case 'border-t':
      style.borderTopWidth = 1;
      return true;
    case 'border-r':
      style.borderRightWidth = 1;
      return true;
    case 'border-b':
      style.borderBottomWidth = 1;
      return true;
    case 'border-l':
      style.borderLeftWidth = 1;
      return true;
    case 'border-dashed':
      style.borderDash = 'dash';
      return true;
    case 'border-dotted':
      style.borderDash = 'dot';
      return true;
    case 'border-solid':
      return true;
    case 'shadow-none':
      style.shadows = [];
      return true;
    case 'bg-transparent':
      style.backgroundColor = 'transparent';
      return true;
    case 'blur-none':
      style.blurRadius = 0;
      return true;
    case 'rounded':
      style.cornerRadius = RADIUS_BY_TOKEN['rounded'];
      return true;
  }

  return (
    applyShadowClass(token, style) ||
    applyRoundedClass(token, style) ||
    applySpacingClass(token, style) ||
    applySizingClass(token, style, warnings) ||
    applyTextClass(token, style) ||
    applyFontClass(token, style) ||
    applyLeadingTrackingClass(token, style) ||
    applyBackgroundClass(token, style, warnings) ||
    applyGradientStopClass(token, style) ||
    applyBorderClass(token, style) ||
    applyBlurOpacityClass(token, style) ||
    applyPositionOffsetClass(token, style) ||
    applyWarnedClass(token, style, warnings)
  );
}

function applyShadowClass(token: string, style: TailwindStyle): boolean {
  if (token === 'shadow') {
    style.shadows = SHADOW_PRESETS['']!;
    return true;
  }
  if (!token.startsWith('shadow-')) return false;
  const suffix = token.slice('shadow-'.length);
  const preset = SHADOW_PRESETS[suffix];
  if (preset) {
    style.shadows = preset;
    return true;
  }
  const match = suffix.match(/^\[(.+)\]$/);
  if (match) {
    const parsed = parseArbitraryShadows(match[1]!.replaceAll('_', ' '));
    if (parsed) {
      style.shadows = parsed;
      return true;
    }
  }
  return false;
}

function parseArbitraryShadows(value: string): ShadowPreset[] | null {
  const shadows: ShadowPreset[] = [];
  for (const part of value.split(/,(?![^(]*\))/)) {
    const segment = part.trim();
    const inner = segment.startsWith('inset ');
    const body = inner ? segment.slice(6) : segment;
    const match = body.match(
      /^(-?[\d.]+)(?:px)? (-?[\d.]+)(?:px)? (-?[\d.]+)(?:px)?(?: (-?[\d.]+)(?:px)?)? (.+)$/,
    );
    if (!match) return null;
    const colorRaw = match[5]!.trim();
    const color = colorRaw.startsWith('#') ? expandShortHex(colorRaw) : rgbToHex(colorRaw);
    if (!color) return null;
    shadows.push({
      type: inner ? 'inner' : 'drop',
      x: Number(match[1]),
      y: Number(match[2]),
      blur: Number(match[3]),
      spread: match[4] !== undefined ? Number(match[4]) : 0,
      color,
    });
  }
  return shadows.length > 0 ? shadows : null;
}

const ROUNDED_CORNER_KEYS: Record<string, Array<keyof TailwindStyle>> = {
  t: ['cornerRadiusTL', 'cornerRadiusTR'],
  b: ['cornerRadiusBL', 'cornerRadiusBR'],
  l: ['cornerRadiusTL', 'cornerRadiusBL'],
  r: ['cornerRadiusTR', 'cornerRadiusBR'],
  tl: ['cornerRadiusTL'],
  tr: ['cornerRadiusTR'],
  bl: ['cornerRadiusBL'],
  br: ['cornerRadiusBR'],
};

function applyRoundedClass(token: string, style: TailwindStyle): boolean {
  if (!token.startsWith('rounded-')) return false;
  const suffix = token.slice('rounded-'.length);

  const uniform = RADIUS_BY_TOKEN[`rounded-${suffix}`];
  if (uniform !== undefined) {
    style.cornerRadius = uniform;
    return true;
  }
  const arbitraryUniform = parseArbitraryPx(suffix);
  if (arbitraryUniform !== null) {
    style.cornerRadius = arbitraryUniform;
    return true;
  }
  if (suffix === 'none') {
    style.cornerRadius = 0;
    return true;
  }

  const match = suffix.match(/^(tl|tr|bl|br|t|b|l|r)(?:-(.+))?$/);
  if (!match) return false;
  const corners = ROUNDED_CORNER_KEYS[match[1]!];
  if (!corners) return false;
  let radius: number | null;
  if (match[2] === undefined) {
    radius = RADIUS_BY_TOKEN['rounded'] ?? 4;
  } else if (match[2] === 'full') {
    radius = 9999;
  } else {
    radius = RADIUS_BY_TOKEN[`rounded-${match[2]}`] ?? parseArbitraryPx(match[2]);
  }
  if (radius === null || radius === undefined) return false;
  for (const corner of corners) {
    (style as Record<string, unknown>)[corner] = radius;
  }
  return true;
}

const PADDING_KEYS: Record<string, Array<keyof TailwindStyle>> = {
  p: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  px: ['paddingLeft', 'paddingRight'],
  py: ['paddingTop', 'paddingBottom'],
  pt: ['paddingTop'],
  pr: ['paddingRight'],
  pb: ['paddingBottom'],
  pl: ['paddingLeft'],
};

function applySpacingClass(token: string, style: TailwindStyle): boolean {
  const match = token.match(/^(p[xytrbl]?|gap(?:-[xy])?|space-[xy])-(.+)$/);
  if (!match) return false;
  const prefix = match[1]!;
  const value = spacingFromSuffix(match[2]!);
  if (value === null) return false;

  const paddingKeys = PADDING_KEYS[prefix];
  if (paddingKeys) {
    for (const key of paddingKeys) {
      (style as Record<string, unknown>)[key] = value;
    }
    return true;
  }
  if (prefix === 'gap') {
    style.gap = value;
    return true;
  }
  if (prefix === 'gap-x' || prefix === 'space-x') {
    style.gapX = value;
    return true;
  }
  if (prefix === 'gap-y' || prefix === 'space-y') {
    style.gapY = value;
    return true;
  }
  return false;
}

function applySizingClass(token: string, style: TailwindStyle, warnings: string[]): boolean {
  const sizeMatch = token.match(/^(w|h|size|min-w|min-h|max-w|max-h)-(.+)$/);
  if (!sizeMatch) return false;
  const prefix = sizeMatch[1]!;
  const suffix = sizeMatch[2]!;

  if (prefix === 'max-w') {
    if (suffix === 'full' || suffix === 'none') return true;
    const preset = MAX_WIDTH_PRESETS[suffix];
    const value = preset ?? sizeFromSuffix(suffix);
    if (value === null) {
      warnings.push(`"${token}" ignored`);
      return true;
    }
    style.maxWidth = value;
    return true;
  }

  const value = sizeFromSuffix(suffix);
  if (value === null) return false;
  switch (prefix) {
    case 'w':
      style.width = value;
      return true;
    case 'h':
      style.height = value;
      return true;
    case 'size':
      style.width = value;
      style.height = value;
      return true;
    case 'min-w':
      style.minWidth = value;
      return true;
    case 'min-h':
      style.minHeight = value;
      return true;
    case 'max-h':
      style.maxHeight = value;
      return true;
  }
  return false;
}

function applyTextClass(token: string, style: TailwindStyle): boolean {
  if (!token.startsWith('text-')) return false;
  const suffix = token.slice('text-'.length);

  const namedSize = FONT_SIZE_BY_TOKEN[token];
  if (namedSize !== undefined) {
    style.fontSize = namedSize;
    return true;
  }

  const arbitrary = suffix.match(/^\[(-?[\d.]+)(px|rem)\]$/);
  if (arbitrary) {
    const numeric = Number(arbitrary[1]);
    style.fontSize = arbitrary[2] === 'rem' ? numeric * 16 : numeric;
    return true;
  }

  const color = resolveColorToken(suffix);
  if (color) {
    style.textColor = color.color;
    if (color.opacity !== undefined) style.textOpacity = color.opacity;
    return true;
  }
  return false;
}

function applyFontClass(token: string, style: TailwindStyle): boolean {
  if (!token.startsWith('font-')) return false;
  const suffix = token.slice('font-'.length);

  const namedWeight = FONT_WEIGHT_BY_TOKEN[token];
  if (namedWeight !== undefined) {
    style.fontWeight = namedWeight;
    return true;
  }

  const familyMatch = suffix.match(/^\['(.+)'\]$/);
  if (familyMatch) {
    style.fontFamily = familyMatch[1]!.replaceAll('_', ' ');
    return true;
  }

  const weightMatch = suffix.match(/^\[(\d{3})\]$/);
  if (weightMatch) {
    style.fontWeight = Number(weightMatch[1]);
    return true;
  }
  return false;
}

function applyLeadingTrackingClass(token: string, style: TailwindStyle): boolean {
  if (token.startsWith('leading-')) {
    const suffix = token.slice('leading-'.length);
    const named = LEADING_BY_TOKEN[token];
    if (named !== undefined) {
      style.lineHeight = named;
      return true;
    }
    const arbitrary = suffix.match(/^\[([\d.]+)\]$/);
    if (arbitrary) {
      style.lineHeight = Number(arbitrary[1]);
      return true;
    }
    const numeric = Number(suffix);
    if (Number.isFinite(numeric) && numeric > 0) {
      style.lineHeight = (numeric * 4) / 16;
      return true;
    }
    return false;
  }

  if (token.startsWith('tracking-')) {
    const suffix = token.slice('tracking-'.length);
    const named = TRACKING_EM[suffix];
    if (named !== undefined) {
      style.letterSpacingEm = named;
      return true;
    }
    const arbitrary = suffix.match(/^\[(-?[\d.]+)(px|em)\]$/);
    if (arbitrary) {
      const numeric = Number(arbitrary[1]);
      if (arbitrary[2] === 'em') {
        style.letterSpacingEm = numeric;
      } else {
        style.letterSpacing = numeric;
      }
      return true;
    }
    return false;
  }
  return false;
}

function applyBackgroundClass(token: string, style: TailwindStyle, warnings: string[]): boolean {
  const gradientMatch = token.match(/^bg-(?:linear|gradient)-to-(t|tr|r|br|b|bl|l|tl)$/);
  if (gradientMatch) {
    const angle = GRADIENT_DIRECTION_ANGLES[gradientMatch[1]!]!;
    style.gradient = { ...style.gradient, angle };
    return true;
  }

  if (!token.startsWith('bg-')) return false;
  const suffix = token.slice('bg-'.length);

  if (suffix.startsWith('[url(') || suffix.startsWith("[url('")) {
    warnings.push(`background image "${token}" is not imported; use an image shape instead`);
    return true;
  }
  if (suffix.startsWith('[linear-gradient') || suffix.startsWith('[radial-gradient')) {
    warnings.push(`arbitrary gradient "${token}" ignored; use bg-linear-to-* with from-/to-`);
    return true;
  }
  if (
    [
      'cover',
      'contain',
      'center',
      'top',
      'bottom',
      'left',
      'right',
      'no-repeat',
      'repeat',
      'fixed',
      'auto',
      'clip-text',
    ].includes(suffix)
  ) {
    return true;
  }

  const color = resolveColorToken(suffix);
  if (color) {
    style.backgroundColor = color.color;
    if (color.opacity !== undefined) style.backgroundOpacity = color.opacity;
    return true;
  }
  return false;
}

function applyGradientStopClass(token: string, style: TailwindStyle): boolean {
  const match = token.match(/^(from|via|to)-(.+)$/);
  if (!match) return false;
  const stop = match[1] as 'from' | 'via' | 'to';
  const suffix = match[2]!;
  if (/^\d/.test(suffix) && suffix.endsWith('%')) return true;
  const color = resolveColorToken(suffix);
  if (!color) return false;
  style.gradient = { angle: 90, ...style.gradient, [stop]: color.color };
  return true;
}

function applyBorderClass(token: string, style: TailwindStyle): boolean {
  const widthMatch = token.match(/^border(?:-(t|r|b|l))?-(\d+|\[[\d.]+px\])$/);
  if (widthMatch) {
    const width = widthMatch[2]!.startsWith('[')
      ? Number(widthMatch[2]!.slice(1, -3))
      : Number(widthMatch[2]);
    if (!Number.isFinite(width)) return false;
    switch (widthMatch[1]) {
      case 't':
        style.borderTopWidth = width;
        break;
      case 'r':
        style.borderRightWidth = width;
        break;
      case 'b':
        style.borderBottomWidth = width;
        break;
      case 'l':
        style.borderLeftWidth = width;
        break;
      default:
        style.borderWidth = width;
    }
    return true;
  }

  const colorMatch = token.match(/^border(?:-(?:t|r|b|l))?-(.+)$/);
  if (colorMatch) {
    const color = resolveColorToken(colorMatch[1]!);
    if (color) {
      style.borderColor = color.color;
      return true;
    }
  }
  return false;
}

function applyBlurOpacityClass(token: string, style: TailwindStyle): boolean {
  if (token.startsWith('backdrop-blur')) {
    const named = BACKDROP_BLUR_BY_TOKEN[token];
    if (named !== undefined) {
      style.backdropBlurRadius = named;
      return true;
    }
    if (token === 'backdrop-blur') {
      style.backdropBlurRadius = 8;
      return true;
    }
    const arbitrary = token.match(/^backdrop-blur-\[([\d.]+)px\]$/);
    if (arbitrary) {
      style.backdropBlurRadius = Number(arbitrary[1]);
      return true;
    }
    return false;
  }

  if (token.startsWith('blur')) {
    const named = BLUR_BY_TOKEN[token];
    if (named !== undefined) {
      style.blurRadius = named;
      return true;
    }
    if (token === 'blur') {
      style.blurRadius = 8;
      return true;
    }
    const arbitrary = token.match(/^blur-\[([\d.]+)px\]$/);
    if (arbitrary) {
      style.blurRadius = Number(arbitrary[1]);
      return true;
    }
    return false;
  }

  const opacityMatch = token.match(/^opacity-(\d+|\[[\d.]+\])$/);
  if (opacityMatch) {
    const raw = opacityMatch[1]!;
    style.opacity = raw.startsWith('[') ? Number(raw.slice(1, -1)) : Number(raw) / 100;
    return true;
  }
  return false;
}

function applyPositionOffsetClass(token: string, style: TailwindStyle): boolean {
  const match = token.match(/^(left|top)-(.+)$/);
  if (!match) return false;
  const value = spacingFromSuffix(match[2]!);
  if (value === null) return false;
  if (match[1] === 'left') style.left = value;
  else style.top = value;
  return true;
}

const WARNED_PREFIXES: Array<{ prefix: string; message: string }> = [
  { prefix: 'grid-', message: 'grid utilities are not supported; layout approximated as a stack' },
  { prefix: 'col-', message: 'grid utilities are not supported; layout approximated as a stack' },
  { prefix: 'row-', message: 'grid utilities are not supported; layout approximated as a stack' },
  { prefix: 'ring', message: 'ring utilities are not supported; use border-* instead' },
  { prefix: 'divide-', message: 'divide utilities are not supported; use gap + borders instead' },
  { prefix: 'right-', message: 'right-* offsets are not supported; use left-*' },
  { prefix: 'bottom-', message: 'bottom-* offsets are not supported; use top-*' },
  { prefix: 'inset-', message: 'inset-* offsets are not supported; use left-*/top-*' },
  { prefix: '-m', message: 'negative margins are not supported' },
  { prefix: 'm-', message: 'margins are not supported; use parent padding or gap' },
  { prefix: 'mx-', message: 'margins are not supported; use parent padding or gap' },
  { prefix: 'my-', message: 'margins are not supported; use parent padding or gap' },
  { prefix: 'mt-', message: 'margins are not supported; use parent padding or gap' },
  { prefix: 'mr-', message: 'margins are not supported; use parent padding or gap' },
  { prefix: 'mb-', message: 'margins are not supported; use parent padding or gap' },
  { prefix: 'ml-', message: 'margins are not supported; use parent padding or gap' },
];

function applyWarnedClass(token: string, _style: TailwindStyle, warnings: string[]): boolean {
  if (token === 'mx-auto') {
    warnings.push('mx-auto ignored; center via the parent layout instead');
    return true;
  }
  for (const { prefix, message } of WARNED_PREFIXES) {
    if (token.startsWith(prefix)) {
      warnings.push(`"${token}": ${message}`);
      return true;
    }
  }
  return false;
}
