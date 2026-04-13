import type {
  InterchangeFill,
  InterchangeStroke,
  InterchangeGradient,
  InterchangeStrokeCap,
  InterchangeStrokeJoin,
  InterchangeDashPattern,
} from '../../interchange-format';
import { normalizeColor, colorToOpacity } from '../color';
import { parseAttr, resolveUrlRef } from './shared';

function parseDashArray(
  el: Element,
  strokeWidth: number,
): {
  dashPattern: InterchangeDashPattern;
  dashArray?: number[];
} {
  const dasharray = el.getAttribute('stroke-dasharray');
  if (!dasharray || dasharray === 'none') {
    return { dashPattern: 'solid' };
  }

  const parts = dasharray
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if (parts.length === 0 || parts.every((p) => p === 0)) {
    return { dashPattern: 'solid' };
  }

  const sw = Math.max(strokeWidth, 1);
  let dashPattern: InterchangeDashPattern = 'dash';
  const first = parts[0] ?? 0;
  if (parts.length <= 2) {
    dashPattern = first <= sw * 1.5 ? 'dot' : 'dash';
  } else {
    dashPattern = 'dash-dot';
  }

  return { dashPattern, dashArray: parts };
}

export function buildFills(
  el: Element,
  gradients: Map<string, InterchangeGradient>,
  patterns: Map<string, string>,
): {
  fills: InterchangeFill[];
  fillGradients: InterchangeGradient[];
  patternImage: string | null;
} {
  const fillAttr = el.getAttribute('fill');

  if (fillAttr === 'none' || fillAttr === 'transparent') {
    return { fills: [], fillGradients: [], patternImage: null };
  }

  const refId = resolveUrlRef(fillAttr);
  if (refId) {
    const gradient = gradients.get(refId);
    if (gradient) {
      return { fills: [], fillGradients: [gradient], patternImage: null };
    }
    const pattern = patterns.get(refId);
    if (pattern) {
      return { fills: [], fillGradients: [], patternImage: pattern };
    }
    return { fills: [], fillGradients: [], patternImage: null };
  }

  const color = normalizeColor(fillAttr);
  if (!color) {
    return { fills: [], fillGradients: [], patternImage: null };
  }

  const { hex, opacity } = colorToOpacity(color);
  const fillOpacity = el.getAttribute('fill-opacity');
  const finalOpacity = fillOpacity ? opacity * parseFloat(fillOpacity) : opacity;

  return {
    fills: [{ color: hex, opacity: finalOpacity, visible: true }],
    fillGradients: [],
    patternImage: null,
  };
}

export function buildStrokes(
  el: Element,
  gradients: Map<string, InterchangeGradient>,
): {
  strokes: InterchangeStroke[];
  strokeGradients: InterchangeGradient[];
} {
  const strokeAttr = el.getAttribute('stroke');
  if (!strokeAttr || strokeAttr === 'none' || strokeAttr === 'transparent') {
    return { strokes: [], strokeGradients: [] };
  }

  const width = parseAttr(el, 'stroke-width', 1);
  if (width <= 0) return { strokes: [], strokeGradients: [] };

  const strokeGradients: InterchangeGradient[] = [];
  const refId = resolveUrlRef(strokeAttr);
  let gradientFallbackColor: string | null = null;
  if (refId) {
    const gradient = gradients.get(refId);
    if (gradient) {
      strokeGradients.push(gradient);
      gradientFallbackColor = gradient.stops[0]?.color ?? null;
    }
  }

  const color = normalizeColor(strokeAttr) ?? gradientFallbackColor ?? '#000000';
  const { hex, opacity: colorOpacity } = colorToOpacity(color);
  const strokeOpacity = el.getAttribute('stroke-opacity');
  const finalOpacity = strokeOpacity ? colorOpacity * parseFloat(strokeOpacity) : colorOpacity;

  const capStr = el.getAttribute('stroke-linecap');
  const cap = (
    ['butt', 'round', 'square'].includes(capStr ?? '') ? capStr : 'butt'
  ) as InterchangeStrokeCap;

  const joinStr = el.getAttribute('stroke-linejoin');
  const join = (
    ['miter', 'round', 'bevel'].includes(joinStr ?? '') ? joinStr : 'miter'
  ) as InterchangeStrokeJoin;

  const { dashPattern, dashArray } = parseDashArray(el, width);

  return {
    strokes: [
      {
        color: hex,
        width,
        opacity: finalOpacity,
        visible: true,
        cap,
        join,
        align: 'center',
        dashPattern,
        dashArray,
        dashOffset: parseAttr(el, 'stroke-dashoffset'),
        miterLimit: parseAttr(el, 'stroke-miterlimit', 4),
      },
    ],
    strokeGradients,
  };
}
