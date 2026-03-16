export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_MATRIX: TransformMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiplyMatrices(m1: TransformMatrix, m2: TransformMatrix): TransformMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function parseTranslate(args: number[]): TransformMatrix {
  const tx = args[0] ?? 0;
  const ty = args[1] ?? 0;
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

function parseScale(args: number[]): TransformMatrix {
  const sx = args[0] ?? 1;
  const sy = args[1] ?? sx;
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

function parseRotate(args: number[]): TransformMatrix {
  const angleDeg = args[0] ?? 0;
  const cx = args[1] ?? 0;
  const cy = args[2] ?? 0;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  if (cx === 0 && cy === 0) {
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  }

  const t1 = parseTranslate([cx, cy]);
  const r = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  const t2 = parseTranslate([-cx, -cy]);
  return multiplyMatrices(multiplyMatrices(t1, r), t2);
}

function parseSkewX(args: number[]): TransformMatrix {
  const rad = ((args[0] ?? 0) * Math.PI) / 180;
  return { a: 1, b: 0, c: Math.tan(rad), d: 1, e: 0, f: 0 };
}

function parseSkewY(args: number[]): TransformMatrix {
  const rad = ((args[0] ?? 0) * Math.PI) / 180;
  return { a: 1, b: Math.tan(rad), c: 0, d: 1, e: 0, f: 0 };
}

function parseMatrix(args: number[]): TransformMatrix {
  return {
    a: args[0] ?? 1,
    b: args[1] ?? 0,
    c: args[2] ?? 0,
    d: args[3] ?? 1,
    e: args[4] ?? 0,
    f: args[5] ?? 0,
  };
}

const TRANSFORM_REGEX = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

export function parseTransform(transformStr: string | null): TransformMatrix {
  if (!transformStr) return IDENTITY_MATRIX;

  let result = IDENTITY_MATRIX;
  let match: RegExpExecArray | null;
  TRANSFORM_REGEX.lastIndex = 0;

  while ((match = TRANSFORM_REGEX.exec(transformStr)) !== null) {
    const fn = match[1]!;
    const args = match[2]!
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n));

    let m: TransformMatrix;
    switch (fn) {
      case 'translate':
        m = parseTranslate(args);
        break;
      case 'scale':
        m = parseScale(args);
        break;
      case 'rotate':
        m = parseRotate(args);
        break;
      case 'skewX':
        m = parseSkewX(args);
        break;
      case 'skewY':
        m = parseSkewY(args);
        break;
      case 'matrix':
        m = parseMatrix(args);
        break;
      default:
        continue;
    }
    result = multiplyMatrices(result, m);
  }

  return result;
}

export function decomposeTransform(m: TransformMatrix): {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  const translateX = m.e;
  const translateY = m.f;
  const scaleX = Math.sqrt(m.a * m.a + m.b * m.b);
  const scaleY = Math.sqrt(m.c * m.c + m.d * m.d);
  const rotation = Math.atan2(m.b, m.a);
  return { translateX, translateY, rotation, scaleX, scaleY };
}

const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#F0F8FF',
  antiquewhite: '#FAEBD7',
  aqua: '#00FFFF',
  aquamarine: '#7FFFD4',
  azure: '#F0FFFF',
  beige: '#F5F5DC',
  bisque: '#FFE4C4',
  black: '#000000',
  blanchedalmond: '#FFEBCD',
  blue: '#0000FF',
  blueviolet: '#8A2BE2',
  brown: '#A52A2A',
  burlywood: '#DEB887',
  cadetblue: '#5F9EA0',
  chartreuse: '#7FFF00',
  chocolate: '#D2691E',
  coral: '#FF7F50',
  cornflowerblue: '#6495ED',
  cornsilk: '#FFF8DC',
  crimson: '#DC143C',
  cyan: '#00FFFF',
  darkblue: '#00008B',
  darkcyan: '#008B8B',
  darkgoldenrod: '#B8860B',
  darkgray: '#A9A9A9',
  darkgreen: '#006400',
  darkgrey: '#A9A9A9',
  darkkhaki: '#BDB76B',
  darkmagenta: '#8B008B',
  darkolivegreen: '#556B2F',
  darkorange: '#FF8C00',
  darkorchid: '#9932CC',
  darkred: '#8B0000',
  darksalmon: '#E9967A',
  darkseagreen: '#8FBC8F',
  darkslateblue: '#483D8B',
  darkslategray: '#2F4F4F',
  darkslategrey: '#2F4F4F',
  darkturquoise: '#00CED1',
  darkviolet: '#9400D3',
  deeppink: '#FF1493',
  deepskyblue: '#00BFFF',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1E90FF',
  firebrick: '#B22222',
  floralwhite: '#FFFAF0',
  forestgreen: '#228B22',
  fuchsia: '#FF00FF',
  gainsboro: '#DCDCDC',
  ghostwhite: '#F8F8FF',
  gold: '#FFD700',
  goldenrod: '#DAA520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#ADFF2F',
  grey: '#808080',
  honeydew: '#F0FFF0',
  hotpink: '#FF69B4',
  indianred: '#CD5C5C',
  indigo: '#4B0082',
  ivory: '#FFFFF0',
  khaki: '#F0E68C',
  lavender: '#E6E6FA',
  lavenderblush: '#FFF0F5',
  lawngreen: '#7CFC00',
  lemonchiffon: '#FFFACD',
  lightblue: '#ADD8E6',
  lightcoral: '#F08080',
  lightcyan: '#E0FFFF',
  lightgoldenrodyellow: '#FAFAD2',
  lightgray: '#D3D3D3',
  lightgreen: '#90EE90',
  lightgrey: '#D3D3D3',
  lightpink: '#FFB6C1',
  lightsalmon: '#FFA07A',
  lightseagreen: '#20B2AA',
  lightskyblue: '#87CEFA',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#B0C4DE',
  lightyellow: '#FFFFE0',
  lime: '#00FF00',
  limegreen: '#32CD32',
  linen: '#FAF0E6',
  magenta: '#FF00FF',
  maroon: '#800000',
  mediumaquamarine: '#66CDAA',
  mediumblue: '#0000CD',
  mediumorchid: '#BA55D3',
  mediumpurple: '#9370DB',
  mediumseagreen: '#3CB371',
  mediumslateblue: '#7B68EE',
  mediumspringgreen: '#00FA9A',
  mediumturquoise: '#48D1CC',
  mediumvioletred: '#C71585',
  midnightblue: '#191970',
  mintcream: '#F5FFFA',
  mistyrose: '#FFE4E1',
  moccasin: '#FFE4B5',
  navajowhite: '#FFDEAD',
  navy: '#000080',
  oldlace: '#FDF5E6',
  olive: '#808000',
  olivedrab: '#6B8E23',
  orange: '#FFA500',
  orangered: '#FF4500',
  orchid: '#DA70D6',
  palegoldenrod: '#EEE8AA',
  palegreen: '#98FB98',
  paleturquoise: '#AFEEEE',
  palevioletred: '#DB7093',
  papayawhip: '#FFEFD5',
  peachpuff: '#FFDAB9',
  peru: '#CD853F',
  pink: '#FFC0CB',
  plum: '#DDA0DD',
  powderblue: '#B0E0E6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#FF0000',
  rosybrown: '#BC8F8F',
  royalblue: '#4169E1',
  saddlebrown: '#8B4513',
  salmon: '#FA8072',
  sandybrown: '#F4A460',
  seagreen: '#2E8B57',
  seashell: '#FFF5EE',
  sienna: '#A0522D',
  silver: '#C0C0C0',
  skyblue: '#87CEEB',
  slateblue: '#6A5ACD',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#FFFAFA',
  springgreen: '#00FF7F',
  steelblue: '#4682B4',
  tan: '#D2B48C',
  teal: '#008080',
  thistle: '#D8BFD8',
  tomato: '#FF6347',
  turquoise: '#40E0D0',
  violet: '#EE82EE',
  wheat: '#F5DEB3',
  white: '#FFFFFF',
  whitesmoke: '#F5F5F5',
  yellow: '#FFFF00',
  yellowgreen: '#9ACD32',
};

export function normalizeColor(color: string | null | undefined): string | null {
  if (!color || color === 'none' || color === 'transparent') return null;

  const trimmed = color.trim().toLowerCase();

  if (NAMED_COLORS[trimmed]) return NAMED_COLORS[trimmed]!;

  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      const r = trimmed[1]!;
      const g = trimmed[2]!;
      const b = trimmed[3]!;
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (trimmed.length === 7 || trimmed.length === 9) {
      return trimmed.toUpperCase();
    }
    return trimmed.toUpperCase();
  }

  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1]!, 10));
    const g = Math.min(255, parseInt(rgbMatch[2]!, 10));
    const b = Math.min(255, parseInt(rgbMatch[3]!, 10));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  const rgbaMatch = trimmed.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbaMatch) {
    const r = Math.min(255, parseInt(rgbaMatch[1]!, 10));
    const g = Math.min(255, parseInt(rgbaMatch[2]!, 10));
    const b = Math.min(255, parseInt(rgbaMatch[3]!, 10));
    const a = Math.round(parseFloat(rgbaMatch[4]!) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  return null;
}

export function colorToOpacity(color: string): { hex: string; opacity: number } {
  if (color.length === 9) {
    const hex = color.slice(0, 7);
    const alpha = parseInt(color.slice(7, 9), 16) / 255;
    return { hex, opacity: alpha };
  }
  return { hex: color, opacity: 1 };
}

export function parseLength(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  return isNaN(num) ? fallback : num;
}

export function parseCssInlineStyle(styleStr: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;

  const parts = styleStr.split(';');
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = part.slice(0, colonIdx).trim();
    const val = part.slice(colonIdx + 1).trim();
    if (prop && val) result[prop] = val;
  }
  return result;
}

export function parseCssStyleSheet(cssText: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  const ruleRegex = /([^{]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selector = match[1]!.trim();
    const declarations = parseCssInlineStyle(match[2]!);
    rules.set(selector, declarations);
  }

  return rules;
}

export function getEffectiveAttribute(
  el: Element,
  attr: string,
  cssProperty: string,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
): string | null {
  if (inlineStyle[cssProperty]) return inlineStyle[cssProperty]!;
  if (classStyles[cssProperty]) return classStyles[cssProperty]!;
  return el.getAttribute(attr);
}

export interface PathCommand {
  type: string;
  values: number[];
}

export function parseSvgPathData(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([\s\S]*?)(?=[MmLlHhVvCcSsQqTtAaZz]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1]!;
    const valStr = match[2]!.trim();
    const values =
      valStr.length > 0
        ? valStr
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => !isNaN(n))
        : [];
    commands.push({ type, values });
  }

  return commands;
}

export function pathCommandsToBounds(commands: PathCommand[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;

  for (const cmd of commands) {
    const { type, values } = cmd;
    switch (type) {
      case 'M':
      case 'L':
      case 'T':
        for (let i = 0; i < values.length; i += 2) {
          cx = values[i]!;
          cy = values[i + 1]!;
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);
        }
        break;
      case 'm':
      case 'l':
      case 't':
        for (let i = 0; i < values.length; i += 2) {
          cx += values[i]!;
          cy += values[i + 1]!;
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);
        }
        break;
      case 'H':
        for (const v of values) {
          cx = v;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
        }
        break;
      case 'h':
        for (const v of values) {
          cx += v;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
        }
        break;
      case 'V':
        for (const v of values) {
          cy = v;
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        }
        break;
      case 'v':
        for (const v of values) {
          cy += v;
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        }
        break;
      case 'C':
        for (let i = 0; i < values.length; i += 6) {
          minX = Math.min(minX, values[i]!, values[i + 2]!, values[i + 4]!);
          minY = Math.min(minY, values[i + 1]!, values[i + 3]!, values[i + 5]!);
          maxX = Math.max(maxX, values[i]!, values[i + 2]!, values[i + 4]!);
          maxY = Math.max(maxY, values[i + 1]!, values[i + 3]!, values[i + 5]!);
          cx = values[i + 4]!;
          cy = values[i + 5]!;
        }
        break;
      case 'c':
        for (let i = 0; i < values.length; i += 6) {
          const x1 = cx + values[i]!;
          const y1 = cy + values[i + 1]!;
          const x2 = cx + values[i + 2]!;
          const y2 = cy + values[i + 3]!;
          const x = cx + values[i + 4]!;
          const y = cy + values[i + 5]!;
          minX = Math.min(minX, x1, x2, x);
          minY = Math.min(minY, y1, y2, y);
          maxX = Math.max(maxX, x1, x2, x);
          maxY = Math.max(maxY, y1, y2, y);
          cx = x;
          cy = y;
        }
        break;
      case 'S':
      case 'Q':
        for (let i = 0; i < values.length; i += 4) {
          minX = Math.min(minX, values[i]!, values[i + 2]!);
          minY = Math.min(minY, values[i + 1]!, values[i + 3]!);
          maxX = Math.max(maxX, values[i]!, values[i + 2]!);
          maxY = Math.max(maxY, values[i + 1]!, values[i + 3]!);
          cx = values[i + 2]!;
          cy = values[i + 3]!;
        }
        break;
      case 's':
      case 'q':
        for (let i = 0; i < values.length; i += 4) {
          const x1 = cx + values[i]!;
          const y1 = cy + values[i + 1]!;
          const x = cx + values[i + 2]!;
          const y = cy + values[i + 3]!;
          minX = Math.min(minX, x1, x);
          minY = Math.min(minY, y1, y);
          maxX = Math.max(maxX, x1, x);
          maxY = Math.max(maxY, y1, y);
          cx = x;
          cy = y;
        }
        break;
      case 'A':
        for (let i = 0; i < values.length; i += 7) {
          cx = values[i + 5]!;
          cy = values[i + 6]!;
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);
        }
        break;
      case 'a':
        for (let i = 0; i < values.length; i += 7) {
          cx += values[i + 5]!;
          cy += values[i + 6]!;
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);
        }
        break;
      case 'Z':
      case 'z':
        break;
    }
  }

  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
