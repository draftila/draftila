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
import {
  normalizeColor,
  colorToOpacity,
  parseLength,
  parseTransform,
  decomposeTransform,
  parseCssInlineStyle,
  parseCssStyleSheet,
  getEffectiveAttribute,
  parseSvgPathData,
  pathCommandsToBounds,
} from './svg-utils';

interface ParseContext {
  gradients: Map<string, InterchangeGradient>;
  clipPaths: Map<string, InterchangeClipPath>;
  classStyles: Map<string, Record<string, string>>;
  defs: Element | null;
}

function buildContext(doc: Document): ParseContext {
  const ctx: ParseContext = {
    gradients: new Map(),
    clipPaths: new Map(),
    classStyles: new Map(),
    defs: null,
  };

  const defs = doc.querySelector('defs');
  ctx.defs = defs;

  if (defs) {
    parseGradients(defs, ctx);
    parseClipPaths(defs, ctx);
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

function parseGradients(defs: Element, ctx: ParseContext): void {
  const linearGrads = defs.querySelectorAll('linearGradient');
  for (const grad of linearGrads) {
    const id = grad.getAttribute('id');
    if (!id) continue;

    const x1 = parseLength(grad.getAttribute('x1'), 0);
    const y1 = parseLength(grad.getAttribute('y1'), 0);
    const x2 = parseLength(grad.getAttribute('x2'), 1);
    const y2 = parseLength(grad.getAttribute('y2'), 0);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

    const stops: InterchangeGradientStop[] = [];
    for (const stop of grad.querySelectorAll('stop')) {
      const offset = parseLength(stop.getAttribute('offset'), 0);
      const stopStyle = parseCssInlineStyle(stop.getAttribute('style'));
      const color =
        normalizeColor(stopStyle['stop-color'] ?? stop.getAttribute('stop-color')) ?? '#000000';
      stops.push({ color, position: offset });
    }

    ctx.gradients.set(id, { type: 'linear', stops, angle });
  }

  const radialGrads = defs.querySelectorAll('radialGradient');
  for (const grad of radialGrads) {
    const id = grad.getAttribute('id');
    if (!id) continue;

    const cx = parseLength(grad.getAttribute('cx'), 0.5);
    const cy = parseLength(grad.getAttribute('cy'), 0.5);
    const r = parseLength(grad.getAttribute('r'), 0.5);

    const stops: InterchangeGradientStop[] = [];
    for (const stop of grad.querySelectorAll('stop')) {
      const offset = parseLength(stop.getAttribute('offset'), 0);
      const stopStyle = parseCssInlineStyle(stop.getAttribute('style'));
      const color =
        normalizeColor(stopStyle['stop-color'] ?? stop.getAttribute('stop-color')) ?? '#000000';
      stops.push({ color, position: offset });
    }

    ctx.gradients.set(id, { type: 'radial', stops, cx, cy, r });
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

function resolveColor(
  el: Element,
  attr: string,
  cssProperty: string,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): { color: string | null; gradient: InterchangeGradient | null } {
  const raw = getEffectiveAttribute(el, attr, cssProperty, inlineStyle, classStyles);
  if (!raw) return { color: null, gradient: null };

  const urlMatch = raw.match(/url\(#([^)]+)\)/);
  if (urlMatch) {
    const gradient = ctx.gradients.get(urlMatch[1]!) ?? null;
    if (gradient && gradient.stops.length > 0) {
      return { color: gradient.stops[0]!.color, gradient };
    }
    return { color: null, gradient };
  }

  return { color: normalizeColor(raw), gradient: null };
}

function buildFills(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): { fills: InterchangeFill[]; gradients: InterchangeGradient[] } {
  const { color, gradient } = resolveColor(el, 'fill', 'fill', inlineStyle, classStyles, ctx);
  const fills: InterchangeFill[] = [];
  const gradients: InterchangeGradient[] = [];

  if (gradient) {
    gradients.push(gradient);
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

  return { fills, gradients };
}

function parseDashPattern(dasharray: string | null, strokeWidth: number): InterchangeDashPattern {
  if (!dasharray || dasharray === 'none') return 'solid';

  const parts = dasharray.split(/[\s,]+/).map(Number);
  if (parts.length === 0 || parts.every((p) => p === 0)) return 'solid';

  const sw = Math.max(strokeWidth, 1);
  const first = parts[0] ?? 0;
  const second = parts[1] ?? first;

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
): InterchangeStroke[] {
  const { color } = resolveColor(el, 'stroke', 'stroke', inlineStyle, classStyles, ctx);
  if (!color) return [];

  const widthStr = getEffectiveAttribute(
    el,
    'stroke-width',
    'stroke-width',
    inlineStyle,
    classStyles,
  );
  const width = parseLength(widthStr, 1);
  if (width <= 0) return [];

  const { hex, opacity: colorOpacity } = colorToOpacity(color);

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

  return [
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
  ];
}

function buildShadows(el: Element, ctx: ParseContext): InterchangeShadow[] {
  const filterAttr = el.getAttribute('filter');
  if (!filterAttr) return [];

  const urlMatch = filterAttr.match(/url\(#([^)]+)\)/);
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

  const urlMatch = clipAttr.match(/url\(#([^)]+)\)/);
  if (!urlMatch) return undefined;

  return ctx.clipPaths.get(urlMatch[1]!) ?? undefined;
}

function parseRectElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const x = parseLength(el.getAttribute('x'));
  const y = parseLength(el.getAttribute('y'));
  const width = parseLength(el.getAttribute('width'), 100);
  const height = parseLength(el.getAttribute('height'), 100);
  const rx = parseLength(el.getAttribute('rx'));
  const ry = parseLength(el.getAttribute('ry'), rx);
  const cornerRadius = Math.max(rx, ry);

  const { fills, gradients } = buildFills(el, inlineStyle, classStyles, ctx);
  const strokes = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  return createInterchangeNode('rectangle', {
    x,
    y,
    width,
    height,
    fills: fills.length > 0 ? fills : [{ color: '#D9D9D9', opacity: 1, visible: true }],
    gradients,
    strokes,
    shadows,
    cornerRadius,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
    clipPath: getClipPath(el, ctx),
  });
}

function parseEllipseElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const isCircle = el.tagName.toLowerCase() === 'circle';
  const cx = parseLength(el.getAttribute('cx'));
  const cy = parseLength(el.getAttribute('cy'));
  const rx = parseLength(isCircle ? el.getAttribute('r') : el.getAttribute('rx'), 50);
  const ry = parseLength(isCircle ? el.getAttribute('r') : el.getAttribute('ry'), 50);

  const { fills, gradients } = buildFills(el, inlineStyle, classStyles, ctx);
  const strokes = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  return createInterchangeNode('ellipse', {
    x: cx - rx,
    y: cy - ry,
    width: rx * 2,
    height: ry * 2,
    fills: fills.length > 0 ? fills : [{ color: '#D9D9D9', opacity: 1, visible: true }],
    gradients,
    strokes,
    shadows,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

function parseLineElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const x1 = parseLength(el.getAttribute('x1'));
  const y1 = parseLength(el.getAttribute('y1'));
  const x2 = parseLength(el.getAttribute('x2'));
  const y2 = parseLength(el.getAttribute('y2'));

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const width = Math.abs(x2 - x1) || 1;
  const height = Math.abs(y2 - y1) || 1;

  const strokes = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  return createInterchangeNode('line', {
    x: minX,
    y: minY,
    width,
    height,
    strokes:
      strokes.length > 0
        ? strokes
        : [
            {
              color: '#000000',
              width: 2,
              opacity: 1,
              visible: true,
              cap: 'butt',
              join: 'miter',
              align: 'center',
              dashPattern: 'solid',
              dashOffset: 0,
              miterLimit: 4,
            },
          ],
    shadows,
    x1,
    y1,
    x2,
    y2,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

function parsePolygonElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const pointsStr = el.getAttribute('points') ?? '';
  const coords = pointsStr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !isNaN(n));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < coords.length; i += 2) {
    const px = coords[i]!;
    const py = coords[i + 1]!;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  const { fills, gradients } = buildFills(el, inlineStyle, classStyles, ctx);
  const strokes = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  const numVertices = Math.floor(coords.length / 2);

  return createInterchangeNode('polygon', {
    x: minX,
    y: minY,
    width: maxX - minX || 100,
    height: maxY - minY || 100,
    fills: fills.length > 0 ? fills : [{ color: '#D9D9D9', opacity: 1, visible: true }],
    gradients,
    strokes,
    shadows,
    sides: Math.max(3, numVertices),
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

function parsePolylineElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const pointsStr = el.getAttribute('points') ?? '';
  const coords = pointsStr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !isNaN(n));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < coords.length; i += 2) {
    const px = coords[i]!;
    const py = coords[i + 1]!;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  const strokes = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  if (coords.length >= 4) {
    const x1 = coords[0]!;
    const y1 = coords[1]!;
    const x2 = coords[coords.length - 2]!;
    const y2 = coords[coords.length - 1]!;

    return createInterchangeNode('line', {
      x: minX,
      y: minY,
      width: maxX - minX || 1,
      height: maxY - minY || 1,
      strokes:
        strokes.length > 0
          ? strokes
          : [
              {
                color: '#000000',
                width: 2,
                opacity: 1,
                visible: true,
                cap: 'butt',
                join: 'miter',
                align: 'center',
                dashPattern: 'solid',
                dashOffset: 0,
                miterLimit: 4,
              },
            ],
      shadows,
      x1,
      y1,
      x2,
      y2,
      opacity: getElementOpacity(el, inlineStyle, classStyles),
    });
  }

  return createInterchangeNode('line', {
    x: minX,
    y: minY,
    width: maxX - minX || 1,
    height: maxY - minY || 1,
    strokes,
    shadows,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

function parsePathElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const d = el.getAttribute('d') ?? '';
  const commands = parseSvgPathData(d);
  const bounds = pathCommandsToBounds(commands);

  const { fills, gradients } = buildFills(el, inlineStyle, classStyles, ctx);
  const strokes = buildStrokes(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  return createInterchangeNode('rectangle', {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || 100,
    height: bounds.height || 100,
    fills,
    gradients,
    strokes,
    shadows,
    svgPathData: d,
    opacity: getElementOpacity(el, inlineStyle, classStyles),
    clipPath: getClipPath(el, ctx),
  });
}

function parseTextElement(
  el: Element,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
  ctx: ParseContext,
): InterchangeNode {
  const x = parseLength(el.getAttribute('x'));
  const y = parseLength(el.getAttribute('y'));
  const content = el.textContent ?? '';

  const { fills } = buildFills(el, inlineStyle, classStyles, ctx);
  const shadows = buildShadows(el, ctx);

  const fontSizeStr = getEffectiveAttribute(el, 'font-size', 'font-size', inlineStyle, classStyles);
  const fontSize = parseLength(fontSizeStr, 16);

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
    x,
    y: y - fontSize,
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
): InterchangeNode {
  const x = parseLength(el.getAttribute('x'));
  const y = parseLength(el.getAttribute('y'));
  const width = parseLength(el.getAttribute('width'), 100);
  const height = parseLength(el.getAttribute('height'), 100);

  const href =
    el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';

  return createInterchangeNode('image', {
    x,
    y,
    width,
    height,
    src: href,
    fit: 'fill',
    opacity: getElementOpacity(el, inlineStyle, classStyles),
  });
}

function parseElement(
  el: Element,
  ctx: ParseContext,
  parentTransformX = 0,
  parentTransformY = 0,
): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();

  if (['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'filter'].includes(tagName)) {
    return null;
  }

  const inlineStyle = parseCssInlineStyle(el.getAttribute('style'));
  const classStyles = getClassStyles(el, ctx);

  const transform = parseTransform(el.getAttribute('transform'));
  const decomposed = decomposeTransform(transform);
  const tx = parentTransformX + decomposed.translateX;
  const ty = parentTransformY + decomposed.translateY;

  if (tagName === 'g') {
    const children: InterchangeNode[] = [];
    for (const child of el.children) {
      const parsed = parseElement(child, ctx, tx, ty);
      if (parsed) children.push(parsed);
    }

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

  let node: InterchangeNode | null = null;

  switch (tagName) {
    case 'rect':
      node = parseRectElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'ellipse':
    case 'circle':
      node = parseEllipseElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'line':
      node = parseLineElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'polygon':
      node = parsePolygonElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'polyline':
      node = parsePolylineElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'path':
      node = parsePathElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'text':
      node = parseTextElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'image':
      node = parseImageElement(el, inlineStyle, classStyles, ctx);
      break;
    case 'use': {
      const href =
        el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
      if (href.startsWith('#') && ctx.defs) {
        const refEl = ctx.defs.ownerDocument.getElementById(href.slice(1));
        if (refEl) {
          node = parseElement(refEl, ctx, tx, ty);
          if (node) {
            node.x += parseLength(el.getAttribute('x'));
            node.y += parseLength(el.getAttribute('y'));
            const useWidth = el.getAttribute('width');
            const useHeight = el.getAttribute('height');
            if (useWidth) node.width = parseLength(useWidth, node.width);
            if (useHeight) node.height = parseLength(useHeight, node.height);
          }
        }
      }
      break;
    }
    default: {
      const children: InterchangeNode[] = [];
      for (const child of el.children) {
        const parsed = parseElement(child, ctx, tx, ty);
        if (parsed) children.push(parsed);
      }
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
  }

  if (node) {
    node.x += tx;
    node.y += ty;
    node.rotation += decomposed.rotation;

    if (decomposed.scaleX !== 1) node.width *= Math.abs(decomposed.scaleX);
    if (decomposed.scaleY !== 1) node.height *= Math.abs(decomposed.scaleY);

    const nameAttr = el.getAttribute('id') ?? el.getAttribute('data-name');
    if (nameAttr) node.name = nameAttr;
  }

  return node;
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
  const nodes: InterchangeNode[] = [];

  for (const child of svgEl.children) {
    const parsed = parseElement(child, ctx);
    if (parsed) nodes.push(parsed);
  }

  return createInterchangeDocument(nodes, { source: 'svg' });
}

export function extractSvgFromHtml(html: string): string | null {
  const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
  return svgMatch?.[0] ?? null;
}
