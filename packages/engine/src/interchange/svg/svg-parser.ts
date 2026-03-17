import type {
  InterchangeNode,
  InterchangeDocument,
  InterchangeFill,
  InterchangeStroke,
  InterchangeGradient,
  InterchangeGradientStop,
  InterchangeShadow,
  InterchangeClipPath,
  InterchangeDashPattern,
  InterchangeStrokeCap,
  InterchangeStrokeJoin,
} from '../interchange-format';
import { createInterchangeNode, createInterchangeDocument } from '../interchange-format';
import { normalizeColor, colorToOpacity } from './color';
import { parseLength, parseCssInlineStyle, parseCssStyleSheet, getEffectiveAttribute } from './css';
import { parseTransform, multiplyMatrices, IDENTITY_MATRIX } from './transform';
import type { TransformMatrix } from './transform';
import {
  parseSvgPathData,
  pathCommandsToBounds,
  normalizePathToAbsolute,
  transformPathCommands,
  pathCommandsToString,
} from './path';
import type { PathCommand } from './path';
import {
  rectToPathCommands,
  ellipseToPathCommands,
  lineToPathCommands,
  polygonToPathCommands,
  polylineToPathCommands,
} from './shapes';

interface RawGradient extends InterchangeGradient {
  userSpaceOnUse?: boolean;
  rawX1?: number;
  rawY1?: number;
  rawX2?: number;
  rawY2?: number;
  rawCx?: number;
  rawCy?: number;
  rawR?: number;
}

interface PatternInfo {
  imageHref: string;
}

interface ParseContext {
  gradients: Map<string, RawGradient>;
  patterns: Map<string, PatternInfo>;
  clipPaths: Map<string, InterchangeClipPath>;
  classStyles: Map<string, Record<string, string>>;
  defs: Element | null;
  inheritedStyles: Record<string, string>;
  currentColor: string;
}

function buildContext(doc: Document): ParseContext {
  const ctx: ParseContext = {
    gradients: new Map(),
    patterns: new Map(),
    clipPaths: new Map(),
    classStyles: new Map(),
    defs: null,
    inheritedStyles: {},
    currentColor: '#000000',
  };

  const defs = doc.querySelector('defs');
  ctx.defs = defs;

  if (defs) {
    parseGradients(defs, ctx);
    parseClipPaths(defs, ctx);
    parsePatterns(defs, ctx, doc);
  }

  const allGradients = doc.querySelectorAll('linearGradient, radialGradient');
  for (const grad of allGradients) {
    if (grad.closest('defs')) continue;
    parseGradientElement(grad, ctx);
  }

  const styleTags = doc.querySelectorAll('style');
  for (const styleEl of styleTags) {
    const cssText = styleEl.textContent ?? '';
    const rules = parseCssStyleSheet(cssText);
    for (const [selector, props] of rules) {
      if (selector.startsWith('.')) {
        ctx.classStyles.set(selector.slice(1), props);
      }
    }
  }

  return ctx;
}

function parseGradientElement(grad: Element, ctx: ParseContext): void {
  const id = grad.getAttribute('id');
  if (!id) return;

  const href = resolveHref(grad) || null;

  let baseStops: InterchangeGradientStop[] = [];
  let baseAttrs: Record<string, string> = {};

  if (href?.startsWith('#')) {
    const refId = href.slice(1);
    const refGrad = ctx.gradients.get(refId);
    if (refGrad) {
      baseStops = [...refGrad.stops];
      if (refGrad.type === 'linear') {
        baseAttrs.angle = String(refGrad.angle ?? 0);
      } else {
        baseAttrs.cx = String(refGrad.cx ?? 0.5);
        baseAttrs.cy = String(refGrad.cy ?? 0.5);
        baseAttrs.r = String(refGrad.r ?? 0.5);
      }
    }
  }

  const ownStops = parseGradientStops(grad);
  const stops = ownStops.length > 0 ? ownStops : baseStops;

  const tagName = grad.tagName.toLowerCase().replace(/^svg:/, '');
  const units = grad.getAttribute('gradientUnits');
  const isUserSpace = units === 'userSpaceOnUse';

  if (tagName === 'lineargradient') {
    const defaultX2 = isUserSpace ? 0 : 1;
    const x1 = parseLength(grad.getAttribute('x1') ?? baseAttrs.x1, 0);
    const y1 = parseLength(grad.getAttribute('y1') ?? baseAttrs.y1, 0);
    const x2 = parseLength(grad.getAttribute('x2') ?? baseAttrs.x2, defaultX2);
    const y2 = parseLength(grad.getAttribute('y2') ?? baseAttrs.y2, 0);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

    const gradient: RawGradient = { type: 'linear', stops, angle };
    if (isUserSpace) {
      gradient.userSpaceOnUse = true;
      gradient.rawX1 = x1;
      gradient.rawY1 = y1;
      gradient.rawX2 = x2;
      gradient.rawY2 = y2;
    }
    ctx.gradients.set(id, gradient);
  } else if (tagName === 'radialgradient') {
    const defaultCenter = isUserSpace ? 0 : 0.5;
    const defaultR = isUserSpace ? 0 : 0.5;
    const cx = parseLength(grad.getAttribute('cx') ?? baseAttrs.cx, defaultCenter);
    const cy = parseLength(grad.getAttribute('cy') ?? baseAttrs.cy, defaultCenter);
    const r = parseLength(grad.getAttribute('r') ?? baseAttrs.r, defaultR);

    const gradient: RawGradient = { type: 'radial', stops, cx, cy, r };
    if (isUserSpace) {
      gradient.userSpaceOnUse = true;
      gradient.rawCx = cx;
      gradient.rawCy = cy;
      gradient.rawR = r;
    }
    ctx.gradients.set(id, gradient);
  }
}

function parseGradientStops(grad: Element): InterchangeGradientStop[] {
  const stops: InterchangeGradientStop[] = [];
  for (const stop of grad.querySelectorAll('stop')) {
    const offset = parseLength(stop.getAttribute('offset'), 0);
    const stopStyle = parseCssInlineStyle(stop.getAttribute('style'));

    const rawColor = stopStyle['stop-color'] ?? stop.getAttribute('stop-color');
    const color = normalizeColor(rawColor) ?? '#000000';

    const rawOpacity = stopStyle['stop-opacity'] ?? stop.getAttribute('stop-opacity');
    const stopOpacity =
      rawOpacity !== null && rawOpacity !== undefined ? parseFloat(rawOpacity) : 1;

    let finalColor = color;
    if (!isNaN(stopOpacity) && stopOpacity < 1 && finalColor.length === 7) {
      const alpha = Math.round(stopOpacity * 255)
        .toString(16)
        .padStart(2, '0');
      finalColor = `${finalColor}${alpha}`.toUpperCase();
    } else if (finalColor.length === 9 && !isNaN(stopOpacity) && stopOpacity < 1) {
      const existingAlpha = parseInt(finalColor.slice(7, 9), 16) / 255;
      const combinedAlpha = existingAlpha * stopOpacity;
      const alpha = Math.round(combinedAlpha * 255)
        .toString(16)
        .padStart(2, '0');
      finalColor = `${finalColor.slice(0, 7)}${alpha}`.toUpperCase();
    }

    stops.push({ color: finalColor, position: offset });
  }
  return stops;
}

function parseGradients(defs: Element, ctx: ParseContext): void {
  const allGrads = defs.querySelectorAll('linearGradient, radialGradient');

  const gradMap = new Map<string, Element>();
  for (const grad of allGrads) {
    const id = grad.getAttribute('id');
    if (id) gradMap.set(id, grad);
  }

  const parsed = new Set<string>();
  function ensureParsed(id: string) {
    if (parsed.has(id)) return;
    const grad = gradMap.get(id);
    if (!grad) return;

    const href = resolveHref(grad);
    if (href.startsWith('#')) {
      ensureParsed(href.slice(1));
    }

    parsed.add(id);
    parseGradientElement(grad, ctx);
  }

  for (const id of gradMap.keys()) {
    ensureParsed(id);
  }
}

function parseClipPaths(defs: Element, ctx: ParseContext): void {
  const clips = defs.querySelectorAll('clipPath');
  for (const clip of clips) {
    const id = clip.getAttribute('id');
    if (!id) continue;

    const rect = clip.querySelector('rect');
    if (rect) {
      ctx.clipPaths.set(id, {
        type: 'rect',
        x: parseLength(rect.getAttribute('x')),
        y: parseLength(rect.getAttribute('y')),
        width: parseLength(rect.getAttribute('width'), 100),
        height: parseLength(rect.getAttribute('height'), 100),
      });
      continue;
    }

    const ellipse = clip.querySelector('ellipse, circle');
    if (ellipse) {
      const rx = parseLength(ellipse.getAttribute('rx') ?? ellipse.getAttribute('r'), 50);
      const ry = parseLength(ellipse.getAttribute('ry') ?? ellipse.getAttribute('r'), 50);
      ctx.clipPaths.set(id, {
        type: 'ellipse',
        x: parseLength(ellipse.getAttribute('cx')) - rx,
        y: parseLength(ellipse.getAttribute('cy')) - ry,
        rx,
        ry,
      });
      continue;
    }

    const path = clip.querySelector('path');
    if (path) {
      ctx.clipPaths.set(id, {
        type: 'path',
        d: path.getAttribute('d') ?? '',
      });
    }
  }
}

function resolveHref(el: Element): string {
  return (
    el.getAttribute('href') ??
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href') ??
    ''
  );
}

function parsePatterns(defs: Element, ctx: ParseContext, doc: Document): void {
  const patternEls = defs.querySelectorAll('pattern');
  for (const pat of patternEls) {
    const id = pat.getAttribute('id');
    if (!id) continue;

    const useEl = pat.querySelector('use');
    if (useEl) {
      const href = resolveHref(useEl);
      if (href.startsWith('#')) {
        const refEl = doc.getElementById(href.slice(1));
        if (refEl && refEl.tagName.toLowerCase() === 'image') {
          const imageHref = resolveHref(refEl);
          if (imageHref) {
            ctx.patterns.set(id, { imageHref });
          }
        }
      }
      continue;
    }

    const imgEl = pat.querySelector('image');
    if (imgEl) {
      const imageHref = resolveHref(imgEl);
      if (imageHref) {
        ctx.patterns.set(id, { imageHref });
      }
    }
  }
}

function getClassStyles(el: Element, ctx: ParseContext): Record<string, string> {
  const classAttr = el.getAttribute('class');
  if (!classAttr) return {};

  const merged: Record<string, string> = {};
  const classes = classAttr.split(/\s+/);
  for (const cls of classes) {
    const styles = ctx.classStyles.get(cls);
    if (styles) Object.assign(merged, styles);
  }
  return merged;
}

function isElementHidden(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
): boolean {
  const display = getEffectiveAttribute(el, 'display', 'display', inlineStyle, classStyles);
  if (display === 'none') return true;

  const visibility = getEffectiveAttribute(
    el,
    'visibility',
    'visibility',
    inlineStyle,
    classStyles,
  );
  if (visibility === 'hidden' || visibility === 'collapse') return true;

  return false;
}

function normalizeGradientForElement(
  raw: RawGradient,
  elX: number,
  elY: number,
  elW: number,
  elH: number,
): InterchangeGradient {
  if (!raw.userSpaceOnUse) {
    return {
      type: raw.type,
      stops: raw.stops,
      angle: raw.angle,
      cx: raw.cx,
      cy: raw.cy,
      r: raw.r,
    };
  }

  if (raw.type === 'linear') {
    return { type: 'linear', stops: raw.stops, angle: raw.angle };
  }

  const w = elW || 1;
  const h = elH || 1;
  const maxDim = Math.max(w, h);
  return {
    type: 'radial',
    stops: raw.stops,
    cx: w > 0 ? ((raw.rawCx ?? 0) - elX) / w : 0.5,
    cy: h > 0 ? ((raw.rawCy ?? 0) - elY) / h : 0.5,
    r: maxDim > 0 ? (raw.rawR ?? 0) / maxDim : 0.5,
  };
}

function resolveColor(
  el: Element,
  attr: string,
  cssProperty: string,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): { color: string | null; gradient: RawGradient | null; pattern: PatternInfo | null } {
  const raw = getEffectiveAttribute(el, attr, cssProperty, inlineStyle, classStyles);
  if (!raw) return { color: null, gradient: null, pattern: null };

  if (raw === 'currentColor' || raw === 'currentcolor') {
    return { color: ctx.currentColor, gradient: null, pattern: null };
  }

  const urlMatch = raw.match(/url\(["']?#([^)"']+)["']?\)/);
  if (urlMatch) {
    const refId = urlMatch[1]!;

    const gradient = ctx.gradients.get(refId) ?? null;
    if (gradient && gradient.stops.length > 0) {
      return { color: gradient.stops[0]!.color, gradient, pattern: null };
    }

    const pattern = ctx.patterns.get(refId) ?? null;
    if (pattern) {
      return { color: null, gradient: null, pattern };
    }

    return { color: null, gradient: null, pattern: null };
  }

  return { color: normalizeColor(raw), gradient: null, pattern: null };
}

function isFillExplicitlyNone(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
): boolean {
  const raw = getEffectiveAttribute(el, 'fill', 'fill', inlineStyle, classStyles);
  return raw === 'none' || raw === 'transparent';
}

function buildFills(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
  elBounds?: { x: number; y: number; w: number; h: number },
): {
  fills: InterchangeFill[];
  gradients: InterchangeGradient[];
  fillNone: boolean;
  patternImage: string | null;
} {
  if (isFillExplicitlyNone(el, inlineStyle, classStyles)) {
    return { fills: [], gradients: [], fillNone: true, patternImage: null };
  }

  const { color, gradient, pattern } = resolveColor(
    el,
    'fill',
    'fill',
    inlineStyle,
    classStyles,
    ctx,
  );

  if (pattern) {
    return { fills: [], gradients: [], fillNone: false, patternImage: pattern.imageHref };
  }

  const fills: InterchangeFill[] = [];
  const gradients: InterchangeGradient[] = [];

  if (gradient) {
    const bounds = elBounds ?? { x: 0, y: 0, w: 100, h: 100 };
    gradients.push(normalizeGradientForElement(gradient, bounds.x, bounds.y, bounds.w, bounds.h));
    if (color) {
      const { hex, opacity } = colorToOpacity(color);
      fills.push({ color: hex, opacity, visible: true });
    }
  } else if (color) {
    const { hex, opacity } = colorToOpacity(color);
    fills.push({ color: hex, opacity, visible: true });
  }

  const fillOpacity = getEffectiveAttribute(
    el,
    'fill-opacity',
    'fill-opacity',
    inlineStyle,
    classStyles,
  );
  if (fillOpacity && fills.length > 0) {
    fills[0]!.opacity *= parseFloat(fillOpacity);
  }

  return { fills, gradients, fillNone: false, patternImage: null };
}

function parseDashPattern(dasharray: string | null, strokeWidth: number): InterchangeDashPattern {
  if (!dasharray || dasharray === 'none') return 'solid';

  const parts = dasharray.split(/[\s,]+/).map(Number);
  if (parts.length === 0 || parts.every((p) => p === 0)) return 'solid';

  const sw = Math.max(strokeWidth, 1);
  const first = parts[0] ?? 0;

  if (parts.length <= 2) {
    if (first <= sw * 1.5) return 'dot';
    return 'dash';
  }

  return 'dash-dot';
}

function buildStrokes(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): { strokes: InterchangeStroke[]; strokeGradients: InterchangeGradient[] } {
  const { color, gradient } = resolveColor(el, 'stroke', 'stroke', inlineStyle, classStyles, ctx);
  if (!color && !gradient) return { strokes: [], strokeGradients: [] };

  const widthStr = getEffectiveAttribute(
    el,
    'stroke-width',
    'stroke-width',
    inlineStyle,
    classStyles,
  );
  const width = parseLength(widthStr, 1);
  if (width <= 0) return { strokes: [], strokeGradients: [] };

  const strokeGradients: InterchangeGradient[] = [];
  if (gradient) {
    strokeGradients.push(gradient);
  }

  const strokeColor = color ?? '#000000';
  const { hex, opacity: colorOpacity } = colorToOpacity(strokeColor);

  const strokeOpacity = getEffectiveAttribute(
    el,
    'stroke-opacity',
    'stroke-opacity',
    inlineStyle,
    classStyles,
  );
  const opacityMultiplier = strokeOpacity ? parseFloat(strokeOpacity) : 1;

  const capStr = getEffectiveAttribute(
    el,
    'stroke-linecap',
    'stroke-linecap',
    inlineStyle,
    classStyles,
  );
  const cap = (
    ['butt', 'round', 'square'].includes(capStr ?? '') ? capStr : 'butt'
  ) as InterchangeStrokeCap;

  const joinStr = getEffectiveAttribute(
    el,
    'stroke-linejoin',
    'stroke-linejoin',
    inlineStyle,
    classStyles,
  );
  const join = (
    ['miter', 'round', 'bevel'].includes(joinStr ?? '') ? joinStr : 'miter'
  ) as InterchangeStrokeJoin;

  const dasharray = getEffectiveAttribute(
    el,
    'stroke-dasharray',
    'stroke-dasharray',
    inlineStyle,
    classStyles,
  );
  const dashPattern = parseDashPattern(dasharray, width);

  const dashOffsetStr = getEffectiveAttribute(
    el,
    'stroke-dashoffset',
    'stroke-dashoffset',
    inlineStyle,
    classStyles,
  );
  const miterStr = getEffectiveAttribute(
    el,
    'stroke-miterlimit',
    'stroke-miterlimit',
    inlineStyle,
    classStyles,
  );

  return {
    strokes: [
      {
        color: hex,
        width,
        opacity: colorOpacity * opacityMultiplier,
        visible: true,
        cap,
        join,
        align: 'center',
        dashPattern,
        dashOffset: parseLength(dashOffsetStr),
        miterLimit: parseLength(miterStr, 4),
      },
    ],
    strokeGradients,
  };
}

function buildShadows(el: Element, ctx: ParseContext): InterchangeShadow[] {
  const filterAttr = el.getAttribute('filter');
  if (!filterAttr) return [];

  const urlMatch = filterAttr.match(/url\(["']?#([^)"']+)["']?\)/);
  if (!urlMatch || !ctx.defs) return [];

  const filter = ctx.defs.querySelector(`filter#${CSS.escape(urlMatch[1]!)}`);
  if (!filter) return [];

  const shadows: InterchangeShadow[] = [];
  const dropShadows = filter.querySelectorAll('feDropShadow');
  for (const ds of dropShadows) {
    const dx = parseLength(ds.getAttribute('dx'));
    const dy = parseLength(ds.getAttribute('dy'));
    const stdDev = parseLength(ds.getAttribute('stdDeviation'));
    const floodColor = normalizeColor(ds.getAttribute('flood-color')) ?? '#000000';
    const floodOpacity = parseLength(ds.getAttribute('flood-opacity'), 1);

    let color = floodColor;
    if (floodOpacity < 1 && color.length === 7) {
      const alpha = Math.round(floodOpacity * 255)
        .toString(16)
        .padStart(2, '0');
      color = `${color}${alpha}`.toUpperCase();
    }

    shadows.push({
      type: 'drop',
      x: dx,
      y: dy,
      blur: stdDev * 2,
      spread: 0,
      color,
      visible: true,
    });
  }

  return shadows;
}

function getElementOpacity(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
): number {
  const opacityStr = getEffectiveAttribute(el, 'opacity', 'opacity', inlineStyle, classStyles);
  if (!opacityStr) return 1;
  const val = parseFloat(opacityStr);
  return isNaN(val) ? 1 : Math.max(0, Math.min(1, val));
}

function getClipPath(el: Element, ctx: ParseContext): InterchangeClipPath | undefined {
  const clipAttr = el.getAttribute('clip-path');
  if (!clipAttr) return undefined;

  const urlMatch = clipAttr.match(/url\(["']?#([^)"']+)["']?\)/);
  if (!urlMatch) return undefined;

  return ctx.clipPaths.get(urlMatch[1]!) ?? undefined;
}

function getFillRule(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
): 'nonzero' | 'evenodd' {
  const raw = getEffectiveAttribute(el, 'fill-rule', 'fill-rule', inlineStyle, classStyles);
  if (raw === 'evenodd') return 'evenodd';
  return 'nonzero';
}

const INHERITABLE_ATTRS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'stroke-opacity',
  'fill-opacity',
  'fill-rule',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-anchor',
  'text-decoration',
  'letter-spacing',
  'color',
];

function collectInheritedStyles(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  parentInherited: Record<string, string>,
): Record<string, string> {
  const merged = { ...parentInherited };
  for (const attr of INHERITABLE_ATTRS) {
    const val = inlineStyle[attr] ?? classStyles[attr] ?? el.getAttribute(attr);
    if (val) merged[attr] = val;
  }
  return merged;
}

function buildPathNode(
  commands: PathCommand[],
  transform: TransformMatrix,
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
  defaultFillColor: string | null,
  isClosedShape: boolean,
): InterchangeNode | null {
  const normalized = normalizePathToAbsolute(commands);

  const isIdentity =
    transform.a === 1 &&
    transform.b === 0 &&
    transform.c === 0 &&
    transform.d === 1 &&
    transform.e === 0 &&
    transform.f === 0;

  const transformed = isIdentity ? normalized : transformPathCommands(normalized, transform);
  const bounds = pathCommandsToBounds(transformed);

  const localCommands: PathCommand[] = transformed.map((cmd) => {
    if (cmd.type === 'Z') return cmd;
    if (cmd.type === 'M' || cmd.type === 'L') {
      return {
        type: cmd.type,
        values: [cmd.values[0]! - bounds.x, cmd.values[1]! - bounds.y],
      };
    }
    if (cmd.type === 'C') {
      return {
        type: 'C',
        values: [
          cmd.values[0]! - bounds.x,
          cmd.values[1]! - bounds.y,
          cmd.values[2]! - bounds.x,
          cmd.values[3]! - bounds.y,
          cmd.values[4]! - bounds.x,
          cmd.values[5]! - bounds.y,
        ],
      };
    }
    if (cmd.type === 'Q') {
      return {
        type: 'Q',
        values: [
          cmd.values[0]! - bounds.x,
          cmd.values[1]! - bounds.y,
          cmd.values[2]! - bounds.x,
          cmd.values[3]! - bounds.y,
        ],
      };
    }
    if (cmd.type === 'A') {
      return {
        type: 'A',
        values: [
          cmd.values[0]!,
          cmd.values[1]!,
          cmd.values[2]!,
          cmd.values[3]!,
          cmd.values[4]!,
          cmd.values[5]! - bounds.x,
          cmd.values[6]! - bounds.y,
        ],
      };
    }
    return cmd;
  });

  const svgPathData = pathCommandsToString(localCommands);
  const elBounds = {
    x: bounds.x,
    y: bounds.y,
    w: bounds.width || 100,
    h: bounds.height || 100,
  };

  const { fills, gradients, fillNone, patternImage } = buildFills(
    el,
    inlineStyle,
    classStyles,
    ctx,
    elBounds,
  );

  if (patternImage) {
    return createInterchangeNode('image', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width || 100,
      height: bounds.height || 100,
      src: patternImage,
      fit: 'fill',
      opacity: getElementOpacity(el, inlineStyle, classStyles),
    });
  }

  const { strokes, strokeGradients } = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);
  const allGradients = [...gradients, ...strokeGradients];
  const fillRule = getFillRule(el, inlineStyle, classStyles);

  let resolvedFills = fills;
  if (fills.length === 0 && !fillNone) {
    if (defaultFillColor) {
      resolvedFills = [{ color: defaultFillColor, opacity: 1, visible: true }];
    } else if (isClosedShape) {
      resolvedFills = [{ color: '#D9D9D9', opacity: 1, visible: true }];
    }
  }

  const defaultStroke =
    !isClosedShape && strokes.length === 0 && resolvedFills.length === 0
      ? [
          {
            color: '#000000' as string,
            width: 2,
            opacity: 1,
            visible: true,
            cap: 'butt' as InterchangeStrokeCap,
            join: 'miter' as InterchangeStrokeJoin,
            align: 'center' as const,
            dashPattern: 'solid' as InterchangeDashPattern,
            dashOffset: 0,
            miterLimit: 4,
          },
        ]
      : strokes;

  if (!isIdentity) {
    const sx = Math.sqrt(transform.a * transform.a + transform.b * transform.b);
    for (const stroke of defaultStroke) {
      stroke.width *= sx;
    }
  }

  return createInterchangeNode('path', {
    name: 'Vector',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || 1,
    height: bounds.height || 1,
    fills: resolvedFills,
    gradients: allGradients,
    strokes: defaultStroke,
    shadows,
    svgPathData,
    fillRule,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
    clipPath: getClipPath(el, ctx),
  });
}

function parseShapeAsPath(
  el: Element,
  ctx: ParseContext,
  transform: TransformMatrix,
): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();
  const inlineStyle = parseCssInlineStyle(el.getAttribute('style'));
  const ownClassStyles = getClassStyles(el, ctx);
  const classStyles = { ...ctx.inheritedStyles, ...ownClassStyles };

  switch (tagName) {
    case 'rect': {
      const x = parseLength(el.getAttribute('x'));
      const y = parseLength(el.getAttribute('y'));
      const w = parseLength(el.getAttribute('width'), 100);
      const h = parseLength(el.getAttribute('height'), 100);
      const rx = parseLength(el.getAttribute('rx'));
      const ry = parseLength(el.getAttribute('ry'), rx);
      const commands = rectToPathCommands(x, y, w, h, rx, ry);

      const node = buildPathNode(
        commands,
        transform,
        el,
        inlineStyle,
        classStyles,
        ctx,
        null,
        true,
      );
      if (node && node.type !== 'image') {
        node.type = 'rectangle';
        node.cornerRadius = Math.max(rx, ry);
      }
      return node;
    }
    case 'ellipse':
    case 'circle': {
      const isCircle = tagName === 'circle';
      const cx = parseLength(el.getAttribute('cx'));
      const cy = parseLength(el.getAttribute('cy'));
      const rx = parseLength(isCircle ? el.getAttribute('r') : el.getAttribute('rx'), 50);
      const ry = parseLength(isCircle ? el.getAttribute('r') : el.getAttribute('ry'), 50);
      const commands = ellipseToPathCommands(cx, cy, rx, ry);

      const node = buildPathNode(
        commands,
        transform,
        el,
        inlineStyle,
        classStyles,
        ctx,
        null,
        true,
      );
      if (node && node.type !== 'image') {
        node.type = 'ellipse';
      }
      return node;
    }
    case 'line': {
      const x1 = parseLength(el.getAttribute('x1'));
      const y1 = parseLength(el.getAttribute('y1'));
      const x2 = parseLength(el.getAttribute('x2'));
      const y2 = parseLength(el.getAttribute('y2'));
      const commands = lineToPathCommands(x1, y1, x2, y2);

      const node = buildPathNode(
        commands,
        transform,
        el,
        inlineStyle,
        classStyles,
        ctx,
        null,
        false,
      );
      if (node) {
        node.type = 'line';
        const nb = pathCommandsToBounds(
          transformPathCommands(normalizePathToAbsolute(commands), transform),
        );
        const tStart = [
          transform.a * x1 + transform.c * y1 + transform.e,
          transform.b * x1 + transform.d * y1 + transform.f,
        ];
        const tEnd = [
          transform.a * x2 + transform.c * y2 + transform.e,
          transform.b * x2 + transform.d * y2 + transform.f,
        ];
        node.x1 = tStart[0]!;
        node.y1 = tStart[1]!;
        node.x2 = tEnd[0]!;
        node.y2 = tEnd[1]!;
        node.x = nb.x;
        node.y = nb.y;
        node.width = nb.width || 1;
        node.height = nb.height || 1;
      }
      return node;
    }
    case 'polygon': {
      const pointsStr = el.getAttribute('points') ?? '';
      const coords = pointsStr
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => !isNaN(n));
      if (coords.length < 4) return null;
      const commands = polygonToPathCommands(coords);
      return buildPathNode(commands, transform, el, inlineStyle, classStyles, ctx, null, true);
    }
    case 'polyline': {
      const pointsStr = el.getAttribute('points') ?? '';
      const coords = pointsStr
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => !isNaN(n));
      if (coords.length < 4) return null;
      const commands = polylineToPathCommands(coords);
      return buildPathNode(commands, transform, el, inlineStyle, classStyles, ctx, null, false);
    }
    case 'path': {
      const d = el.getAttribute('d') ?? '';
      const commands = parseSvgPathData(d);
      return buildPathNode(commands, transform, el, inlineStyle, classStyles, ctx, '#000000', true);
    }
    default:
      return null;
  }
}

function parseTextElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
  transform: TransformMatrix,
): InterchangeNode {
  const rawX = parseLength(el.getAttribute('x'));
  const rawY = parseLength(el.getAttribute('y'));
  const content = el.textContent ?? '';

  const tx = transform.a * rawX + transform.c * rawY + transform.e;
  const ty = transform.b * rawX + transform.d * rawY + transform.f;
  const scaleFactor = Math.sqrt(transform.a * transform.a + transform.b * transform.b);

  const { fills } = buildFills(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  const fontSizeStr = getEffectiveAttribute(el, 'font-size', 'font-size', inlineStyle, classStyles);
  const fontSize = parseLength(fontSizeStr, 16) * scaleFactor;

  const fontFamily =
    getEffectiveAttribute(el, 'font-family', 'font-family', inlineStyle, classStyles) ?? 'Inter';

  const fontWeightStr = getEffectiveAttribute(
    el,
    'font-weight',
    'font-weight',
    inlineStyle,
    classStyles,
  );
  let fontWeight = 400;
  if (fontWeightStr) {
    if (fontWeightStr === 'bold') fontWeight = 700;
    else if (fontWeightStr === 'normal') fontWeight = 400;
    else {
      const parsed = parseInt(fontWeightStr, 10);
      if (!isNaN(parsed)) fontWeight = parsed;
    }
  }

  const fontStyleStr = getEffectiveAttribute(
    el,
    'font-style',
    'font-style',
    inlineStyle,
    classStyles,
  );
  const fontStyle: 'normal' | 'italic' = fontStyleStr === 'italic' ? 'italic' : 'normal';

  const textAnchor = getEffectiveAttribute(
    el,
    'text-anchor',
    'text-anchor',
    inlineStyle,
    classStyles,
  );
  let textAlign: 'left' | 'center' | 'right' = 'left';
  if (textAnchor === 'middle') textAlign = 'center';
  else if (textAnchor === 'end') textAlign = 'right';

  const decorationStr = getEffectiveAttribute(
    el,
    'text-decoration',
    'text-decoration',
    inlineStyle,
    classStyles,
  );
  let textDecoration: 'none' | 'underline' | 'strikethrough' = 'none';
  if (decorationStr?.includes('underline')) textDecoration = 'underline';
  else if (decorationStr?.includes('line-through')) textDecoration = 'strikethrough';

  const letterSpacingStr = getEffectiveAttribute(
    el,
    'letter-spacing',
    'letter-spacing',
    inlineStyle,
    classStyles,
  );

  const estimatedWidth = Math.max(200, content.length * fontSize * 0.6);

  return createInterchangeNode('text', {
    x: tx,
    y: ty - fontSize,
    width: estimatedWidth,
    height: fontSize * 1.5,
    content,
    fontSize,
    fontFamily: fontFamily.replace(/["']/g, ''),
    fontWeight,
    fontStyle,
    textAlign,
    textDecoration,
    letterSpacing: parseLength(letterSpacingStr),
    fills: fills.length > 0 ? fills : [{ color: '#000000', opacity: 1, visible: true }],
    shadows,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

function parseImageElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  _ctx: ParseContext,
  transform: TransformMatrix,
): InterchangeNode {
  const x = parseLength(el.getAttribute('x'));
  const y = parseLength(el.getAttribute('y'));
  const width = parseLength(el.getAttribute('width'), 100);
  const height = parseLength(el.getAttribute('height'), 100);

  const corners = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const tx = transform.a * cx! + transform.c * cy! + transform.e;
    const ty = transform.b * cx! + transform.d * cy! + transform.f;
    minX = Math.min(minX, tx);
    minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx);
    maxY = Math.max(maxY, ty);
  }

  const href = resolveHref(el);

  const par = el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
  let fit: 'fill' | 'fit' | 'crop' = 'fill';
  if (par === 'none') {
    fit = 'fill';
  } else if (par.includes('meet')) {
    fit = 'fit';
  } else if (par.includes('slice')) {
    fit = 'crop';
  }

  return createInterchangeNode('image', {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    src: href,
    fit,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

const SHAPE_TAGS = new Set(['rect', 'ellipse', 'circle', 'line', 'polygon', 'polyline', 'path']);

const SKIP_TAGS = new Set([
  'defs',
  'style',
  'title',
  'desc',
  'metadata',
  'clippath',
  'filter',
  'symbol',
  'marker',
]);

function parseElement(
  el: Element,
  ctx: ParseContext,
  parentTransform: TransformMatrix,
): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tagName)) return null;

  const inlineStyle = parseCssInlineStyle(el.getAttribute('style'));
  const ownClassStyles = getClassStyles(el, ctx);
  const classStyles = { ...ctx.inheritedStyles, ...ownClassStyles };

  if (isElementHidden(el, inlineStyle, classStyles)) return null;

  const elTransform = parseTransform(el.getAttribute('transform'));
  const combinedTransform = multiplyMatrices(parentTransform, elTransform);

  const colorAttr = getEffectiveAttribute(el, 'color', 'color', inlineStyle, classStyles);
  const prevColor = ctx.currentColor;
  if (colorAttr) {
    const resolved = normalizeColor(colorAttr);
    if (resolved) ctx.currentColor = resolved;
  }

  if (SHAPE_TAGS.has(tagName)) {
    const node = parseShapeAsPath(el, ctx, combinedTransform);
    if (node) {
      const nameAttr = el.getAttribute('id') ?? el.getAttribute('data-name');
      if (nameAttr) node.name = nameAttr;
    }
    ctx.currentColor = prevColor;
    return node;
  }

  if (tagName === 'text') {
    const node = parseTextElement(el, inlineStyle, classStyles, ctx, combinedTransform);
    const nameAttr = el.getAttribute('id') ?? el.getAttribute('data-name');
    if (nameAttr) node.name = nameAttr;
    ctx.currentColor = prevColor;
    return node;
  }

  if (tagName === 'image') {
    const node = parseImageElement(el, inlineStyle, classStyles, ctx, combinedTransform);
    ctx.currentColor = prevColor;
    return node;
  }

  if (tagName === 'use') {
    const href = resolveHref(el);
    if (href.startsWith('#')) {
      const refEl = (ctx.defs?.ownerDocument ?? el.ownerDocument).getElementById(href.slice(1));
      if (refEl) {
        const useX = parseLength(el.getAttribute('x'));
        const useY = parseLength(el.getAttribute('y'));
        const useTranslate: TransformMatrix = {
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: useX,
          f: useY,
        };
        const useTransform = multiplyMatrices(combinedTransform, useTranslate);
        const node = parseElement(refEl, ctx, useTransform);
        if (node) {
          const useWidth = el.getAttribute('width');
          const useHeight = el.getAttribute('height');
          if (useWidth) node.width = parseLength(useWidth, node.width);
          if (useHeight) node.height = parseLength(useHeight, node.height);
        }
        ctx.currentColor = prevColor;
        return node;
      }
    }
    ctx.currentColor = prevColor;
    return null;
  }

  if (tagName === 'foreignobject') {
    const x = parseLength(el.getAttribute('x'));
    const y = parseLength(el.getAttribute('y'));
    const w = parseLength(el.getAttribute('width'), 100);
    const h = parseLength(el.getAttribute('height'), 100);
    const tx = combinedTransform.a * x + combinedTransform.c * y + combinedTransform.e;
    const ty = combinedTransform.b * x + combinedTransform.d * y + combinedTransform.f;
    ctx.currentColor = prevColor;
    return createInterchangeNode('rectangle', {
      x: tx,
      y: ty,
      width: w,
      height: h,
      fills: [{ color: '#E0E0E0', opacity: 0.5, visible: true }],
    });
  }

  if (tagName === 'g' || tagName === 'a' || tagName === 'svg') {
    const prevInherited = ctx.inheritedStyles;
    ctx.inheritedStyles = collectInheritedStyles(el, inlineStyle, classStyles, prevInherited);

    const children: InterchangeNode[] = [];
    for (const child of el.children) {
      const parsed = parseElement(child, ctx, combinedTransform);
      if (parsed) children.push(parsed);
    }

    ctx.inheritedStyles = prevInherited;
    ctx.currentColor = prevColor;

    if (children.length === 0) return null;
    if (children.length === 1) {
      const single = children[0]!;
      single.opacity *= getElementOpacity(el, inlineStyle, classStyles);
      return single;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of children) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + c.height);
    }

    for (const c of children) {
      c.x -= minX;
      c.y -= minY;
    }

    return createInterchangeNode('group', {
      name: el.getAttribute('id') ?? '',
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      opacity: getElementOpacity(el, inlineStyle, classStyles),
      children,
    });
  }

  const children: InterchangeNode[] = [];
  for (const child of el.children) {
    const parsed = parseElement(child, ctx, combinedTransform);
    if (parsed) children.push(parsed);
  }
  ctx.currentColor = prevColor;
  if (children.length === 1) return children[0]!;
  if (children.length > 1) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of children) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + c.height);
    }
    return createInterchangeNode('group', {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      children,
    });
  }
  return null;
}

function parseSvgDimensions(svgEl: Element): {
  width: number;
  height: number;
  minX: number;
  minY: number;
  vbWidth: number;
  vbHeight: number;
  hasViewBox: boolean;
} {
  let vbMinX = 0;
  let vbMinY = 0;
  let vbWidth = 0;
  let vbHeight = 0;
  let hasViewBox = false;

  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      vbMinX = parts[0]!;
      vbMinY = parts[1]!;
      vbWidth = parts[2]!;
      vbHeight = parts[3]!;
      hasViewBox = true;
    }
  }

  const w = parseLength(svgEl.getAttribute('width'), 0);
  const h = parseLength(svgEl.getAttribute('height'), 0);

  if (hasViewBox) {
    const outputW = w > 0 ? w : vbWidth;
    const outputH = h > 0 ? h : vbHeight;
    return {
      width: outputW,
      height: outputH,
      minX: vbMinX,
      minY: vbMinY,
      vbWidth,
      vbHeight,
      hasViewBox: true,
    };
  }

  if (w > 0 && h > 0) {
    return { minX: 0, minY: 0, width: w, height: h, vbWidth: w, vbHeight: h, hasViewBox: false };
  }

  return {
    minX: 0,
    minY: 0,
    width: 100,
    height: 100,
    vbWidth: 100,
    vbHeight: 100,
    hasViewBox: false,
  };
}

export function parseSvg(svgString: string): InterchangeDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    return createInterchangeDocument([], { source: 'svg' });
  }

  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    return createInterchangeDocument([], { source: 'svg' });
  }

  const ctx = buildContext(doc);

  const svgInlineStyle = parseCssInlineStyle(svgEl.getAttribute('style'));
  const svgClassStyles = getClassStyles(svgEl, ctx);
  ctx.inheritedStyles = collectInheritedStyles(svgEl, svgInlineStyle, svgClassStyles, {});

  const colorAttr = getEffectiveAttribute(svgEl, 'color', 'color', svgInlineStyle, svgClassStyles);
  if (colorAttr) {
    const resolved = normalizeColor(colorAttr);
    if (resolved) ctx.currentColor = resolved;
  }

  const { width, height, minX, minY, vbWidth, vbHeight, hasViewBox } = parseSvgDimensions(svgEl);

  let rootTransform = IDENTITY_MATRIX;
  if (hasViewBox && vbWidth > 0 && vbHeight > 0) {
    const scaleX = width / vbWidth;
    const scaleY = height / vbHeight;
    rootTransform = {
      a: scaleX,
      b: 0,
      c: 0,
      d: scaleY,
      e: -minX * scaleX,
      f: -minY * scaleY,
    };
  } else if (minX !== 0 || minY !== 0) {
    rootTransform = { a: 1, b: 0, c: 0, d: 1, e: -minX, f: -minY };
  }

  const children: InterchangeNode[] = [];
  for (const child of svgEl.children) {
    const parsed = parseElement(child, ctx, rootTransform);
    if (parsed) children.push(parsed);
  }

  if (children.length === 0) {
    return createInterchangeDocument([], { source: 'svg' });
  }

  if (children.length === 1) {
    return createInterchangeDocument(children, { source: 'svg' });
  }

  const frame = createInterchangeNode('frame', {
    x: 0,
    y: 0,
    width,
    height,
    clip: true,
    children,
  });

  return createInterchangeDocument([frame], { source: 'svg' });
}

export function extractSvgFromHtml(html: string): string | null {
  const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
  return svgMatch?.[0] ?? null;
}
