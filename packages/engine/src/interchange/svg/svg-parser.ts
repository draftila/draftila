import { optimize } from 'svgo';
import SVGPathCommander from 'svg-path-commander';
import type {
  InterchangeNode,
  InterchangeDocument,
  InterchangeFill,
  InterchangeStroke,
  InterchangeGradient,
  InterchangeGradientStop,
  InterchangeStrokeCap,
  InterchangeStrokeJoin,
  InterchangeDashPattern,
  InterchangeClipPath,
  InterchangeShadow,
  InterchangeBlur,
} from '../interchange-format';
import { createInterchangeNode, createInterchangeDocument } from '../interchange-format';
import { normalizeColor, colorToOpacity } from './color';
import { parseLength } from './css';

export interface ParseSvgOptions {
  mode?: 'editable' | 'fidelity';
}

function normalizeSvg(svgString: string): string {
  const result = optimize(svgString, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            convertShapeToPath: { convertArcs: true },
            mergePaths: false,
            cleanupIds: false,
            removeHiddenElems: true,
            removeEmptyContainers: true,
          },
        },
      } as never,
      'convertStyleToAttrs' as never,
    ],
  });
  return result.data;
}

function parseAttr(el: Element, attr: string, fallback = 0): number {
  return parseLength(el.getAttribute(attr), fallback);
}

function parseSvgViewportSize(svgEl: Element): { width: number; height: number } {
  let width = parseLength(svgEl.getAttribute('width'), 0);
  let height = parseLength(svgEl.getAttribute('height'), 0);
  const viewBox = svgEl.getAttribute('viewBox');

  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      if (width <= 0) width = Math.max(0, parts[2] ?? 0);
      if (height <= 0) height = Math.max(0, parts[3] ?? 0);
    }
  }

  if (width <= 0) width = 100;
  if (height <= 0) height = 100;

  return { width, height };
}

function parseSvgAsImage(svgString: string): InterchangeDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const errorNode = doc.querySelector('parsererror');
  const svgEl = doc.querySelector('svg');

  if (errorNode || !svgEl) {
    return createInterchangeDocument([], { source: 'svg' });
  }

  const { width, height } = parseSvgViewportSize(svgEl);
  const svgNode = createInterchangeNode('svg', {
    x: 0,
    y: 0,
    width,
    height,
    svgContent: svgString,
    preserveAspectRatio: svgEl.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet',
  });

  return createInterchangeDocument([svgNode], { source: 'svg' });
}

function resolveGradients(doc: Document): Map<string, InterchangeGradient> {
  const gradients = new Map<string, InterchangeGradient>();

  function parseStops(el: Element): InterchangeGradientStop[] {
    const stops: InterchangeGradientStop[] = [];
    for (const stop of el.querySelectorAll('stop')) {
      const offset = parseFloat(stop.getAttribute('offset') ?? '0');
      const rawColor = stop.getAttribute('stop-color');
      const color = normalizeColor(rawColor) ?? '#000000';
      const rawOpacity = stop.getAttribute('stop-opacity');
      const stopOpacity = rawOpacity ? parseFloat(rawOpacity) : 1;

      let finalColor = color;
      if (!isNaN(stopOpacity) && stopOpacity < 1 && finalColor.length === 7) {
        const alpha = Math.round(stopOpacity * 255)
          .toString(16)
          .padStart(2, '0');
        finalColor = `${finalColor}${alpha}`.toUpperCase();
      }

      stops.push({ color: finalColor, position: offset });
    }
    return stops;
  }

  function resolveHref(el: Element): string {
    return (
      el.getAttribute('href') ??
      el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
      el.getAttribute('xlink:href') ??
      ''
    );
  }

  const allGrads = doc.querySelectorAll('linearGradient, radialGradient');
  const gradMap = new Map<string, Element>();
  for (const g of allGrads) {
    const id = g.getAttribute('id');
    if (id) gradMap.set(id, g);
  }

  for (const [id, el] of gradMap) {
    const href = resolveHref(el);
    let ownStops = parseStops(el);
    if (ownStops.length === 0 && href.startsWith('#')) {
      const ref = gradMap.get(href.slice(1));
      if (ref) ownStops = parseStops(ref);
    }
    if (ownStops.length === 0) continue;

    const tagName = el.tagName.toLowerCase().replace(/^svg:/, '');
    const isUserSpace = el.getAttribute('gradientUnits') === 'userSpaceOnUse';

    if (tagName === 'lineargradient') {
      const x1 = parseFloat(el.getAttribute('x1') ?? '0');
      const y1 = parseFloat(el.getAttribute('y1') ?? '0');
      const x2 = parseFloat(el.getAttribute('x2') ?? (isUserSpace ? '0' : '1'));
      const y2 = parseFloat(el.getAttribute('y2') ?? '0');
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      gradients.set(id, { type: 'linear', stops: ownStops, angle });
    } else if (tagName === 'radialgradient') {
      const cx = parseFloat(el.getAttribute('cx') ?? (isUserSpace ? '0' : '0.5'));
      const cy = parseFloat(el.getAttribute('cy') ?? (isUserSpace ? '0' : '0.5'));
      const r = parseFloat(el.getAttribute('r') ?? (isUserSpace ? '0' : '0.5'));
      gradients.set(id, { type: 'radial', stops: ownStops, cx, cy, r });
    }
  }

  return gradients;
}

function resolvePatterns(doc: Document): Map<string, string> {
  const patterns = new Map<string, string>();
  const patternEls = doc.querySelectorAll('pattern');

  function resolveHref(el: Element): string {
    return (
      el.getAttribute('href') ??
      el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
      el.getAttribute('xlink:href') ??
      ''
    );
  }

  for (const pat of patternEls) {
    const id = pat.getAttribute('id');
    if (!id) continue;

    const useEl = pat.querySelector('use');
    if (useEl) {
      const href = resolveHref(useEl);
      if (href.startsWith('#')) {
        const refEl = doc.getElementById(href.slice(1));
        if (refEl?.tagName.toLowerCase() === 'image') {
          const imageHref = resolveHref(refEl);
          if (imageHref) patterns.set(id, imageHref);
        }
      }
      continue;
    }

    const imgEl = pat.querySelector('image');
    if (imgEl) {
      const imageHref = resolveHref(imgEl);
      if (imageHref) patterns.set(id, imageHref);
    }
  }

  return patterns;
}

function resolveUrlRef(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/url\(["']?#([^)"']+)["']?\)/);
  return match?.[1] ?? null;
}

function buildFills(
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

function buildStrokes(
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
  if (refId) {
    const gradient = gradients.get(refId);
    if (gradient) strokeGradients.push(gradient);
  }

  const color = normalizeColor(strokeAttr) ?? '#000000';
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

  const dasharray = el.getAttribute('stroke-dasharray');
  let dashPattern: InterchangeDashPattern = 'solid';
  if (dasharray && dasharray !== 'none') {
    const parts = dasharray.split(/[\s,]+/).map(Number);
    if (parts.length > 0 && !parts.every((p) => p === 0)) {
      const first = parts[0] ?? 0;
      const sw = Math.max(width, 1);
      if (parts.length <= 2) {
        dashPattern = first <= sw * 1.5 ? 'dot' : 'dash';
      } else {
        dashPattern = 'dash-dot';
      }
    }
  }

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
        dashOffset: parseAttr(el, 'stroke-dashoffset'),
        miterLimit: parseAttr(el, 'stroke-miterlimit', 4),
      },
    ],
    strokeGradients,
  };
}

function getPathBBox(d: string): { x: number; y: number; width: number; height: number } {
  try {
    const bbox = SVGPathCommander.getPathBBox(d);
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

function normalizePathData(d: string): {
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

interface ParseCtx {
  gradients: Map<string, InterchangeGradient>;
  patterns: Map<string, string>;
  clipPaths: Map<string, InterchangeClipPath>;
  masks: Map<string, InterchangeClipPath>;
  filters: Map<string, { shadows: InterchangeShadow[]; blurs: InterchangeBlur[] }>;
  inheritedFillNone: boolean;
}

function resolveClipPathRef(value: string | null): string | null {
  return resolveUrlRef(value);
}

function parseTranslateTransform(transform: string | null): { tx: number; ty: number } {
  if (!transform) return { tx: 0, ty: 0 };
  const translateMatch = transform.match(/translate\(([^)]+)\)/i);
  if (!translateMatch) return { tx: 0, ty: 0 };
  const parts = translateMatch[1]!
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return { tx: parts[0] ?? 0, ty: parts[1] ?? 0 };
}

function resolveClipPaths(doc: Document): Map<string, InterchangeClipPath> {
  const map = new Map<string, InterchangeClipPath>();
  for (const clipEl of doc.querySelectorAll('clipPath')) {
    const id = clipEl.getAttribute('id');
    if (!id) continue;

    const first = clipEl.firstElementChild;
    if (!first) continue;

    const tag = first.tagName.toLowerCase();
    if (tag === 'rect') {
      const { tx, ty } = parseTranslateTransform(first.getAttribute('transform'));
      map.set(id, {
        type: 'rect',
        x: parseAttr(first, 'x') + tx,
        y: parseAttr(first, 'y') + ty,
        width: parseAttr(first, 'width'),
        height: parseAttr(first, 'height'),
        rx: parseAttr(first, 'rx'),
        ry: parseAttr(first, 'ry'),
      });
      continue;
    }

    if (tag === 'ellipse' || tag === 'circle') {
      const cx = parseAttr(first, 'cx');
      const cy = parseAttr(first, 'cy');
      const rx = parseAttr(first, tag === 'circle' ? 'r' : 'rx');
      const ry = parseAttr(first, tag === 'circle' ? 'r' : 'ry');
      map.set(id, { type: 'ellipse', x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 });
      continue;
    }

    if (tag === 'path') {
      const d = first.getAttribute('d');
      if (d) {
        const bbox = getPathBBox(d);
        if (bbox.width > 0 && bbox.height > 0) {
          map.set(id, {
            type: 'rect',
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
          });
        } else {
          map.set(id, { type: 'path', d });
        }
      }
    }
  }
  return map;
}

function resolveMasks(doc: Document): Map<string, InterchangeClipPath> {
  const map = new Map<string, InterchangeClipPath>();
  for (const maskEl of doc.querySelectorAll('mask')) {
    const id = maskEl.getAttribute('id');
    if (!id) continue;

    const width = parseAttr(maskEl, 'width', 0);
    const height = parseAttr(maskEl, 'height', 0);
    if (width > 0 && height > 0) {
      map.set(id, {
        type: 'rect',
        x: parseAttr(maskEl, 'x', 0),
        y: parseAttr(maskEl, 'y', 0),
        width,
        height,
      });
      continue;
    }

    const first = maskEl.firstElementChild;
    if (first?.tagName.toLowerCase() === 'path') {
      const d = first.getAttribute('d');
      if (!d) continue;
      const bbox = getPathBBox(d);
      map.set(id, { type: 'rect', x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height });
    }
  }
  return map;
}

function alphaToColor(alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const hex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#000000${hex}`;
}

function resolveFilters(
  doc: Document,
): Map<string, { shadows: InterchangeShadow[]; blurs: InterchangeBlur[] }> {
  const map = new Map<string, { shadows: InterchangeShadow[]; blurs: InterchangeBlur[] }>();

  for (const filterEl of doc.querySelectorAll('filter')) {
    const id = filterEl.getAttribute('id');
    if (!id) continue;

    const shadows: InterchangeShadow[] = [];
    const blurs: InterchangeBlur[] = [];

    const offsetEl = filterEl.querySelector('feOffset');
    const blurEl = filterEl.querySelector('feGaussianBlur');

    if (offsetEl && blurEl) {
      const dx = parseAttr(offsetEl, 'dx', 0);
      const dy = parseAttr(offsetEl, 'dy', 0);
      const stdDeviation = parseAttr(blurEl, 'stdDeviation', 0);

      let alpha = 0.25;
      for (const matrixEl of filterEl.querySelectorAll('feColorMatrix')) {
        const values = matrixEl.getAttribute('values');
        if (!values) continue;
        const nums = values
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => Number.isFinite(n));
        if (nums.length === 20) {
          alpha = nums[19] ?? alpha;
        }
      }

      shadows.push({
        type: 'drop',
        x: dx,
        y: dy,
        blur: stdDeviation * 2,
        spread: 0,
        color: alphaToColor(alpha),
        visible: true,
      });
    }

    const hasOffset = Boolean(offsetEl);
    if (!hasOffset && blurEl) {
      const stdDeviation = parseAttr(blurEl, 'stdDeviation', 0);
      if (stdDeviation > 0) {
        blurs.push({ type: 'layer', radius: stdDeviation, visible: true });
      }
    }

    if (shadows.length > 0 || blurs.length > 0) {
      map.set(id, { shadows, blurs });
    }
  }

  return map;
}

function applyEffectsToNode(
  node: InterchangeNode,
  effects: { shadows: InterchangeShadow[]; blurs: InterchangeBlur[] },
  opacityMultiplier: number,
): void {
  node.opacity *= opacityMultiplier;
  if (effects.shadows.length > 0) node.shadows = [...node.shadows, ...effects.shadows];
  if (effects.blurs.length > 0) node.blurs = [...node.blurs, ...effects.blurs];

  if (node.children.length > 0) {
    for (const child of node.children) {
      applyEffectsToNode(child, effects, 1);
    }
  }
}

function wrapChildrenInClipFrame(
  children: InterchangeNode[],
  clip: InterchangeClipPath,
): InterchangeNode | null {
  if (clip.type !== 'rect' || clip.width === undefined || clip.height === undefined) return null;
  return createInterchangeNode('frame', {
    x: clip.x ?? 0,
    y: clip.y ?? 0,
    width: clip.width,
    height: clip.height,
    clip: true,
    children,
  });
}

function parsePathElement(
  el: Element,
  gradients: Map<string, InterchangeGradient>,
  patterns: Map<string, string>,
  inheritedFillNone = false,
): InterchangeNode | null {
  const d = el.getAttribute('d');
  if (!d) return null;

  const { localD, bounds } = normalizePathData(d);
  if (bounds.width === 0 && bounds.height === 0) return null;

  const { fills, fillGradients, patternImage } = buildFills(el, gradients, patterns);

  if (patternImage) {
    return createInterchangeNode('image', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      src: patternImage,
      fit: 'fill',
    });
  }

  const { strokes, strokeGradients } = buildStrokes(el, gradients);
  const allGradients = [...fillGradients, ...strokeGradients];

  const fillRule =
    el.getAttribute('fill-rule') === 'evenodd' ? ('evenodd' as const) : ('nonzero' as const);

  const opacity = el.getAttribute('opacity');

  let resolvedFills = fills;
  if (fills.length === 0 && fillGradients.length === 0) {
    const fillAttr = el.getAttribute('fill');
    if (fillAttr === 'none' || fillAttr === 'transparent') {
    } else if (fillAttr === null && inheritedFillNone) {
    } else {
      resolvedFills = [{ color: '#000000', opacity: 1, visible: true }];
    }
  }

  return createInterchangeNode('path', {
    name: el.getAttribute('data-name') ?? 'Vector',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || 1,
    height: bounds.height || 1,
    fills: resolvedFills,
    gradients: allGradients,
    strokes,
    svgPathData: localD,
    fillRule,
    opacity: opacity ? parseFloat(opacity) : 1,
  });
}

function parseTextElement(el: Element): InterchangeNode {
  const x = parseAttr(el, 'x');
  const y = parseAttr(el, 'y');
  const content = el.textContent ?? '';

  const fillAttr = el.getAttribute('fill');
  const color = normalizeColor(fillAttr) ?? '#000000';
  const { hex, opacity } = colorToOpacity(color);

  const fontSize = parseAttr(el, 'font-size', 16);
  const fontFamily = (el.getAttribute('font-family') ?? 'Inter').replace(/["']/g, '');

  const fontWeightStr = el.getAttribute('font-weight');
  let fontWeight = 400;
  if (fontWeightStr === 'bold') fontWeight = 700;
  else if (fontWeightStr && fontWeightStr !== 'normal') {
    const parsed = parseInt(fontWeightStr, 10);
    if (!isNaN(parsed)) fontWeight = parsed;
  }

  const fontStyle: 'normal' | 'italic' =
    el.getAttribute('font-style') === 'italic' ? 'italic' : 'normal';

  const textAnchor = el.getAttribute('text-anchor');
  let textAlign: 'left' | 'center' | 'right' = 'left';
  if (textAnchor === 'middle') textAlign = 'center';
  else if (textAnchor === 'end') textAlign = 'right';

  const estimatedWidth = Math.max(200, content.length * fontSize * 0.6);

  return createInterchangeNode('text', {
    name: el.getAttribute('data-name') ?? '',
    x,
    y: y - fontSize,
    width: estimatedWidth,
    height: fontSize * 1.5,
    content,
    fontSize,
    fontFamily,
    fontWeight,
    fontStyle,
    textAlign,
    fills: [{ color: hex, opacity, visible: true }],
    opacity: el.getAttribute('opacity') ? parseFloat(el.getAttribute('opacity')!) : 1,
  });
}

function parseImageElement(el: Element): InterchangeNode {
  const x = parseAttr(el, 'x');
  const y = parseAttr(el, 'y');
  const width = parseAttr(el, 'width', 100);
  const height = parseAttr(el, 'height', 100);

  const href =
    el.getAttribute('href') ??
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href') ??
    '';

  const par = el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
  let fit: 'fill' | 'fit' | 'crop' = 'fill';
  if (par === 'none') fit = 'fill';
  else if (par.includes('meet')) fit = 'fit';
  else if (par.includes('slice')) fit = 'crop';

  return createInterchangeNode('image', {
    x,
    y,
    width,
    height,
    src: href,
    fit,
  });
}

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
  'lineargradient',
  'radialgradient',
  'pattern',
  'mask',
]);

function parseElement(el: Element, ctx: ParseCtx): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tagName)) return null;

  const display = el.getAttribute('display');
  if (display === 'none') return null;
  const visibility = el.getAttribute('visibility');
  if (visibility === 'hidden' || visibility === 'collapse') return null;

  const ownFill = el.getAttribute('fill');
  const childCtx: ParseCtx = {
    ...ctx,
    inheritedFillNone: ownFill === 'none' || (ownFill === null && ctx.inheritedFillNone),
  };

  if (tagName === 'path') {
    return parsePathElement(el, ctx.gradients, ctx.patterns, ctx.inheritedFillNone);
  }

  if (tagName === 'text') {
    return parseTextElement(el);
  }

  if (tagName === 'image') {
    return parseImageElement(el);
  }

  if (tagName === 'rect') {
    const x = parseAttr(el, 'x');
    const y = parseAttr(el, 'y');
    const w = parseAttr(el, 'width', 100);
    const h = parseAttr(el, 'height', 100);
    const rx = parseAttr(el, 'rx');

    const { fills, fillGradients, patternImage } = buildFills(el, ctx.gradients, ctx.patterns);
    if (patternImage) {
      return createInterchangeNode('image', {
        x,
        y,
        width: w,
        height: h,
        src: patternImage,
        fit: 'fill',
      });
    }
    const { strokes, strokeGradients } = buildStrokes(el, ctx.gradients);

    return createInterchangeNode('rectangle', {
      name: el.getAttribute('data-name') ?? '',
      x,
      y,
      width: w,
      height: h,
      cornerRadius: rx,
      fills,
      strokes,
      gradients: [...fillGradients, ...strokeGradients],
      opacity: el.getAttribute('opacity') ? parseFloat(el.getAttribute('opacity')!) : 1,
    });
  }

  if (tagName === 'circle' || tagName === 'ellipse') {
    const isCircle = tagName === 'circle';
    const cx = parseAttr(el, 'cx');
    const cy = parseAttr(el, 'cy');
    const rx = parseAttr(el, isCircle ? 'r' : 'rx', 50);
    const ry = parseAttr(el, isCircle ? 'r' : 'ry', 50);

    const { fills, fillGradients } = buildFills(el, ctx.gradients, ctx.patterns);
    const { strokes, strokeGradients } = buildStrokes(el, ctx.gradients);

    return createInterchangeNode('ellipse', {
      name: el.getAttribute('data-name') ?? '',
      x: cx - rx,
      y: cy - ry,
      width: rx * 2,
      height: ry * 2,
      fills,
      strokes,
      gradients: [...fillGradients, ...strokeGradients],
      opacity: el.getAttribute('opacity') ? parseFloat(el.getAttribute('opacity')!) : 1,
    });
  }

  if (tagName === 'g' || tagName === 'a' || tagName === 'svg') {
    const children: InterchangeNode[] = [];
    for (const child of el.children) {
      const parsed = parseElement(child, childCtx);
      if (parsed) children.push(parsed);
    }

    if (children.length === 0) return null;

    const opacity = parseFloat(el.getAttribute('opacity') ?? '1');
    const filterRef = resolveClipPathRef(el.getAttribute('filter'));
    const groupEffects = filterRef ? ctx.filters.get(filterRef) : undefined;
    const clipRef = resolveClipPathRef(el.getAttribute('clip-path'));
    const maskRef = resolveClipPathRef(el.getAttribute('mask'));
    const clip =
      (clipRef ? ctx.clipPaths.get(clipRef) : undefined) ??
      (maskRef ? ctx.masks.get(maskRef) : undefined);

    const effects = groupEffects ?? { shadows: [], blurs: [] };
    for (const child of children) {
      applyEffectsToNode(child, effects, Number.isFinite(opacity) ? opacity : 1);
    }

    if (clip) {
      const clipped = wrapChildrenInClipFrame(children, clip);
      if (clipped) return clipped;
    }

    if (children.length === 1) {
      return children[0]!;
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

    return createInterchangeNode('group', {
      name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      opacity: 1,
      children,
    });
  }

  const children: InterchangeNode[] = [];
  for (const child of el.children) {
    const parsed = parseElement(child, childCtx);
    if (parsed) children.push(parsed);
  }
  if (children.length === 1) return children[0]!;
  return null;
}

export function parseSvg(svgString: string, options: ParseSvgOptions = {}): InterchangeDocument {
  if (options.mode === 'fidelity') {
    return parseSvgAsImage(svgString);
  }

  let normalizedSvg: string;
  try {
    normalizedSvg = normalizeSvg(svgString);
  } catch {
    return createInterchangeDocument([], { source: 'svg' });
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedSvg, 'image/svg+xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    return createInterchangeDocument([], { source: 'svg' });
  }

  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    return createInterchangeDocument([], { source: 'svg' });
  }

  const gradients = resolveGradients(doc);
  const patterns = resolvePatterns(doc);
  const clipPaths = resolveClipPaths(doc);
  const masks = resolveMasks(doc);
  const filters = resolveFilters(doc);

  const svgFill = svgEl.getAttribute('fill');
  const ctx: ParseCtx = {
    gradients,
    patterns,
    clipPaths,
    masks,
    filters,
    inheritedFillNone: svgFill === 'none',
  };

  const widthAttr = parseAttr(svgEl, 'width', 0);
  const heightAttr = parseAttr(svgEl, 'height', 0);
  const viewBox = svgEl.getAttribute('viewBox');

  let svgWidth = widthAttr;
  let svgHeight = heightAttr;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      if (svgWidth <= 0) svgWidth = parts[2]!;
      if (svgHeight <= 0) svgHeight = parts[3]!;
    }
  }
  if (svgWidth <= 0) svgWidth = 100;
  if (svgHeight <= 0) svgHeight = 100;

  const children: InterchangeNode[] = [];
  for (const child of svgEl.children) {
    const parsed = parseElement(child, ctx);
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
    width: svgWidth,
    height: svgHeight,
    clip: true,
    children,
  });

  return createInterchangeDocument([frame], { source: 'svg' });
}

export function extractSvgFromHtml(html: string): string | null {
  const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
  return svgMatch?.[0] ?? null;
}
