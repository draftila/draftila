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
            convertShapeToPath: false,
            mergePaths: false,
            cleanupIds: false,
            removeHiddenElems: true,
            removeEmptyContainers: true,
            collapseGroups: false,
            convertTransform: false,
          },
        },
      } as never,
      'convertStyleToAttrs' as never,
      'inlineStyles' as never,
      'moveGroupAttrsToElems' as never,
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

    const gradTransform = parseTransformMatrix(el.getAttribute('gradientTransform'));

    if (tagName === 'lineargradient') {
      let x1 = parseFloat(el.getAttribute('x1') ?? '0');
      let y1 = parseFloat(el.getAttribute('y1') ?? '0');
      let x2 = parseFloat(el.getAttribute('x2') ?? (isUserSpace ? '0' : '1'));
      let y2 = parseFloat(el.getAttribute('y2') ?? '0');

      if (gradTransform) {
        const p1 = gradTransform.transformPoint({ x: x1, y: y1 });
        const p2 = gradTransform.transformPoint({ x: x2, y: y2 });
        x1 = p1.x;
        y1 = p1.y;
        x2 = p2.x;
        y2 = p2.y;
      }

      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      gradients.set(id, { type: 'linear', stops: ownStops, angle });
    } else if (tagName === 'radialgradient') {
      let cx = parseFloat(el.getAttribute('cx') ?? (isUserSpace ? '0' : '0.5'));
      let cy = parseFloat(el.getAttribute('cy') ?? (isUserSpace ? '0' : '0.5'));
      let r = parseFloat(el.getAttribute('r') ?? (isUserSpace ? '0' : '0.5'));

      if (gradTransform) {
        const center = gradTransform.transformPoint({ x: cx, y: cy });
        const edge = gradTransform.transformPoint({ x: cx + r, y: cy });
        cx = center.x;
        cy = center.y;
        r = Math.sqrt((edge.x - cx) ** 2 + (edge.y - cy) ** 2);
      }

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

function parseTransformMatrix(transform: string | null): DOMMatrix | null {
  if (!transform || transform.trim() === '') return null;

  const matrix = new DOMMatrix();
  const fns = [...transform.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\(([^)]+)\)/gi)];

  if (fns.length === 0) return null;

  for (const fn of fns) {
    const name = fn[1]!.toLowerCase();
    const args = fn[2]!
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    switch (name) {
      case 'matrix': {
        if (args.length >= 6) {
          const m = new DOMMatrix([args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!]);
          matrix.multiplySelf(m);
        }
        break;
      }
      case 'translate': {
        matrix.translateSelf(args[0] ?? 0, args[1] ?? 0);
        break;
      }
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args[1] ?? sx;
        matrix.scaleSelf(sx, sy);
        break;
      }
      case 'rotate': {
        const angle = args[0] ?? 0;
        const cx = args[1] ?? 0;
        const cy = args[2] ?? 0;
        if (cx !== 0 || cy !== 0) {
          matrix.translateSelf(cx, cy);
          matrix.rotateSelf(angle);
          matrix.translateSelf(-cx, -cy);
        } else {
          matrix.rotateSelf(angle);
        }
        break;
      }
      case 'skewx': {
        matrix.skewXSelf(args[0] ?? 0);
        break;
      }
      case 'skewy': {
        matrix.skewYSelf(args[0] ?? 0);
        break;
      }
    }
  }

  return matrix;
}

function isIdentityMatrix(m: DOMMatrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

function isTranslateOnly(m: DOMMatrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1;
}

function decomposeTransform(m: DOMMatrix): {
  tx: number;
  ty: number;
  rotation: number;
  sx: number;
  sy: number;
} {
  const tx = m.e;
  const ty = m.f;
  const sx = Math.sqrt(m.a * m.a + m.b * m.b);
  const sy = Math.sqrt(m.c * m.c + m.d * m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return { tx, ty, rotation, sx, sy };
}

function elementToPathData(el: Element): string | null {
  const tagName = el.tagName.toLowerCase();

  switch (tagName) {
    case 'path': {
      return el.getAttribute('d');
    }
    case 'rect': {
      const x = parseAttr(el, 'x');
      const y = parseAttr(el, 'y');
      const w = parseAttr(el, 'width', 0);
      const h = parseAttr(el, 'height', 0);
      const rx = Math.min(parseAttr(el, 'rx'), w / 2);
      const ry = Math.min(parseAttr(el, 'ry', rx), h / 2);

      if (w <= 0 || h <= 0) return null;

      if (rx <= 0 && ry <= 0) {
        return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      }

      const r = Math.max(rx, ry);
      return [
        `M${x + r} ${y}`,
        `H${x + w - r}`,
        `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
        `V${y + h - r}`,
        `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
        `H${x + r}`,
        `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
        `V${y + r}`,
        `A${r} ${r} 0 0 1 ${x + r} ${y}`,
        'Z',
      ].join('');
    }
    case 'circle': {
      const cx = parseAttr(el, 'cx');
      const cy = parseAttr(el, 'cy');
      const r = parseAttr(el, 'r');
      if (r <= 0) return null;
      return [
        `M${cx - r} ${cy}`,
        `A${r} ${r} 0 0 1 ${cx + r} ${cy}`,
        `A${r} ${r} 0 0 1 ${cx - r} ${cy}`,
        'Z',
      ].join('');
    }
    case 'ellipse': {
      const cx = parseAttr(el, 'cx');
      const cy = parseAttr(el, 'cy');
      const rx = parseAttr(el, 'rx');
      const ry = parseAttr(el, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return [
        `M${cx - rx} ${cy}`,
        `A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`,
        `A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`,
        'Z',
      ].join('');
    }
    case 'line': {
      const x1 = parseAttr(el, 'x1');
      const y1 = parseAttr(el, 'y1');
      const x2 = parseAttr(el, 'x2');
      const y2 = parseAttr(el, 'y2');
      return `M${x1} ${y1}L${x2} ${y2}`;
    }
    case 'polyline':
    case 'polygon': {
      const points = el.getAttribute('points');
      if (!points) return null;
      const coords = points
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (coords.length < 4) return null;
      const parts: string[] = [];
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i]!;
        const y = coords[i + 1];
        if (y === undefined) break;
        parts.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
      }
      if (tagName === 'polygon') parts.push('Z');
      return parts.join('');
    }
    default:
      return null;
  }
}

function transformPathWithMatrix(pathData: string, matrix: DOMMatrix): string {
  try {
    const segments = SVGPathCommander.parsePathString(pathData);
    const transformed: string[] = [];

    let cx = 0;
    let cy = 0;

    for (const seg of segments) {
      const cmd = seg[0] as string;

      switch (cmd) {
        case 'M':
        case 'L': {
          const pt = matrix.transformPoint({ x: seg[1] as number, y: seg[2] as number });
          transformed.push(`${cmd}${pt.x} ${pt.y}`);
          cx = seg[1] as number;
          cy = seg[2] as number;
          break;
        }
        case 'H': {
          const pt = matrix.transformPoint({ x: seg[1] as number, y: cy });
          transformed.push(`L${pt.x} ${pt.y}`);
          cx = seg[1] as number;
          break;
        }
        case 'V': {
          const pt = matrix.transformPoint({ x: cx, y: seg[1] as number });
          transformed.push(`L${pt.x} ${pt.y}`);
          cy = seg[1] as number;
          break;
        }
        case 'C': {
          const p1 = matrix.transformPoint({ x: seg[1] as number, y: seg[2] as number });
          const p2 = matrix.transformPoint({ x: seg[3] as number, y: seg[4] as number });
          const p3 = matrix.transformPoint({ x: seg[5] as number, y: seg[6] as number });
          transformed.push(`C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
          cx = seg[5] as number;
          cy = seg[6] as number;
          break;
        }
        case 'Q': {
          const qp1 = matrix.transformPoint({ x: seg[1] as number, y: seg[2] as number });
          const qp2 = matrix.transformPoint({ x: seg[3] as number, y: seg[4] as number });
          transformed.push(`Q${qp1.x} ${qp1.y} ${qp2.x} ${qp2.y}`);
          cx = seg[3] as number;
          cy = seg[4] as number;
          break;
        }
        case 'A': {
          const rx = seg[1] as number;
          const ry = seg[2] as number;
          const angle = seg[3] as number;
          const largeArc = seg[4] as number;
          const sweep = seg[5] as number;
          const endPt = matrix.transformPoint({ x: seg[6] as number, y: seg[7] as number });
          const { sx, sy } = decomposeTransform(matrix);
          transformed.push(
            `A${rx * sx} ${ry * sy} ${angle} ${largeArc} ${sweep} ${endPt.x} ${endPt.y}`,
          );
          cx = seg[6] as number;
          cy = seg[7] as number;
          break;
        }
        case 'Z':
        case 'z': {
          transformed.push('Z');
          break;
        }
        default: {
          transformed.push(seg.join(' '));
          break;
        }
      }
    }

    return transformed.join('');
  } catch {
    return pathData;
  }
}

interface ParseCtx {
  gradients: Map<string, InterchangeGradient>;
  patterns: Map<string, string>;
  clipPaths: Map<string, InterchangeClipPath>;
  masks: Map<string, InterchangeClipPath>;
  filters: Map<string, { shadows: InterchangeShadow[]; blurs: InterchangeBlur[] }>;
  symbols: Map<string, Element>;
  inheritedFillNone: boolean;
  inheritedFill: string | null;
  inheritedStroke: string | null;
  inheritedStrokeWidth: number | null;
  parentMatrix: DOMMatrix;
}

function resolveClipPaths(doc: Document): Map<string, InterchangeClipPath> {
  const map = new Map<string, InterchangeClipPath>();
  for (const clipEl of doc.querySelectorAll('clipPath')) {
    const id = clipEl.getAttribute('id');
    if (!id) continue;

    const pathParts: string[] = [];
    for (const child of clipEl.children) {
      const d = elementToPathData(child);
      if (!d) continue;
      const transformStr = child.getAttribute('transform');
      const matrix = parseTransformMatrix(transformStr);
      pathParts.push(matrix ? transformPathWithMatrix(d, matrix) : d);
    }

    if (pathParts.length > 0) {
      const combinedD = pathParts.join('');
      const bbox = getPathBBox(combinedD);
      if (bbox.width > 0 || bbox.height > 0) {
        map.set(id, {
          type: 'path',
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          d: combinedD,
        });
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
    if (first) {
      const d = elementToPathData(first);
      if (d) {
        const bbox = getPathBBox(d);
        map.set(id, { type: 'rect', x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height });
      }
    }
  }
  return map;
}

function resolveSymbols(doc: Document): Map<string, Element> {
  const map = new Map<string, Element>();
  for (const sym of doc.querySelectorAll('symbol')) {
    const id = sym.getAttribute('id');
    if (id) map.set(id, sym);
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

function colorMatrixToShadowColor(matrixEl: Element): string {
  const values = matrixEl.getAttribute('values');
  if (!values) return alphaToColor(0.25);

  const nums = values
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if (nums.length !== 20) return alphaToColor(0.25);

  const r = Math.round(Math.max(0, Math.min(1, nums[4] ?? 0)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, nums[9] ?? 0)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, nums[14] ?? 0)) * 255);
  const a = Math.round(Math.max(0, Math.min(1, nums[19] ?? 1)) * 255);

  const hex = (c: number) => c.toString(16).padStart(2, '0').toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}`;
}

function parseShadowChain(
  children: Element[],
  startIndex: number,
  shadowType: 'drop' | 'inner',
): { shadow: InterchangeShadow | null; nextIndex: number } {
  let dx = 0;
  let dy = 0;
  let stdDeviation = 0;
  let shadowColor = alphaToColor(0.25);
  let i = startIndex;
  let foundOffset = false;
  let foundBlur = false;

  while (i < children.length) {
    const child = children[i]!;
    const tag = child.tagName.toLowerCase();

    if (tag === 'feoffset' && !foundOffset) {
      dx = parseAttr(child, 'dx', 0);
      dy = parseAttr(child, 'dy', 0);
      foundOffset = true;
      i++;
    } else if (tag === 'fegaussianblur' && !foundBlur) {
      stdDeviation = parseAttr(child, 'stdDeviation', 0);
      foundBlur = true;
      i++;
    } else if (tag === 'fecolormatrix') {
      shadowColor = colorMatrixToShadowColor(child);
      i++;
    } else if (tag === 'fecomposite') {
      i++;
    } else if (tag === 'feblend') {
      i++;
    } else if (tag === 'feflood') {
      const floodColor = normalizeColor(child.getAttribute('flood-color'));
      const floodOpacity = parseFloat(child.getAttribute('flood-opacity') ?? '1');
      if (floodColor) {
        const { hex } = colorToOpacity(floodColor);
        const alphaHex = Math.round(Math.max(0, Math.min(1, floodOpacity)) * 255)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase();
        shadowColor = `${hex}${alphaHex}`;
      }
      i++;
    } else {
      break;
    }

    if (foundOffset && foundBlur) break;
  }

  if (!foundOffset && !foundBlur) {
    return { shadow: null, nextIndex: i };
  }

  return {
    shadow: {
      type: shadowType,
      x: dx,
      y: dy,
      blur: stdDeviation * 2,
      spread: 0,
      color: shadowColor,
      visible: true,
    },
    nextIndex: i,
  };
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
    const children = Array.from(filterEl.children);

    const hasArithmeticComposite = children.some(
      (c) =>
        c.tagName.toLowerCase() === 'fecomposite' && c.getAttribute('operator') === 'arithmetic',
    );
    const isInnerShadowFilter = hasArithmeticComposite;

    let i = 0;
    while (i < children.length) {
      const child = children[i]!;
      const tag = child.tagName.toLowerCase();

      if (tag === 'feflood' && child.getAttribute('flood-opacity') === '0') {
        i++;
        continue;
      }

      if (tag === 'fecolormatrix' && child.getAttribute('in') === 'SourceAlpha') {
        const nextChildren = children.slice(i);
        const shadowType = isInnerShadowFilter ? 'inner' : 'drop';
        const { shadow, nextIndex } = parseShadowChain(nextChildren, 0, shadowType);
        if (shadow) {
          shadows.push(shadow);
          i += nextIndex;
          continue;
        }
      }

      if (tag === 'feoffset') {
        const shadowType = isInnerShadowFilter ? 'inner' : 'drop';
        const remainingChildren = children.slice(i);
        const { shadow, nextIndex } = parseShadowChain(remainingChildren, 0, shadowType);
        if (shadow) {
          shadows.push(shadow);
          i += nextIndex;
          continue;
        }
      }

      if (tag === 'fegaussianblur') {
        const inAttr = child.getAttribute('in');
        const resultAttr = child.getAttribute('result');
        const isStandaloneBlur =
          !resultAttr?.includes('hardAlpha') &&
          (inAttr === 'SourceGraphic' || inAttr === 'shape' || !inAttr);

        if (isStandaloneBlur && shadows.length === 0) {
          const stdDeviation = parseAttr(child, 'stdDeviation', 0);
          if (stdDeviation > 0) {
            blurs.push({ type: 'layer', radius: stdDeviation, visible: true });
          }
        }
      }

      i++;
    }

    if (shadows.length === 0 && blurs.length === 0) {
      const allOffsets = filterEl.querySelectorAll('feOffset');
      const allBlurs = filterEl.querySelectorAll('feGaussianBlur');

      if (allOffsets.length > 0 && allBlurs.length > 0) {
        for (const offsetEl of allOffsets) {
          const dx = parseAttr(offsetEl, 'dx', 0);
          const dy = parseAttr(offsetEl, 'dy', 0);

          let stdDeviation = 4;
          for (const blurChild of allBlurs) {
            const sd = parseAttr(blurChild, 'stdDeviation', 0);
            if (sd > 0) {
              stdDeviation = sd;
              break;
            }
          }

          let color = alphaToColor(0.25);
          for (const matrixEl of filterEl.querySelectorAll('feColorMatrix')) {
            color = colorMatrixToShadowColor(matrixEl);
          }

          shadows.push({
            type: isInnerShadowFilter ? 'inner' : 'drop',
            x: dx,
            y: dy,
            blur: stdDeviation * 2,
            spread: 0,
            color,
            visible: true,
          });
        }
      } else if (allBlurs.length > 0 && allOffsets.length === 0) {
        for (const blurChild of allBlurs) {
          const stdDeviation = parseAttr(blurChild, 'stdDeviation', 0);
          if (stdDeviation > 0) {
            blurs.push({ type: 'layer', radius: stdDeviation, visible: true });
          }
        }
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
  if (clip.width === undefined || clip.height === undefined) return null;
  if (clip.width <= 0 && clip.height <= 0) return null;
  return createInterchangeNode('frame', {
    x: clip.x ?? 0,
    y: clip.y ?? 0,
    width: clip.width,
    height: clip.height,
    clip: true,
    clipPath: clip,
    children,
  });
}

function parseBlendMode(el: Element): string {
  const style = el.getAttribute('style');
  if (style) {
    const match = style.match(/mix-blend-mode:\s*([^;]+)/i);
    if (match) {
      const mode = match[1]!.trim().toLowerCase();
      const modeMap: Record<string, string> = {
        normal: 'normal',
        multiply: 'multiply',
        screen: 'screen',
        overlay: 'overlay',
        darken: 'darken',
        lighten: 'lighten',
        'color-dodge': 'color-dodge',
        'color-burn': 'color-burn',
        'hard-light': 'hard-light',
        'soft-light': 'soft-light',
        difference: 'difference',
        exclusion: 'exclusion',
        hue: 'hue',
        saturation: 'saturation',
        color: 'color',
        luminosity: 'luminosity',
      };
      return modeMap[mode] ?? 'normal';
    }
  }
  return 'normal';
}

function resolveHref(el: Element): string {
  return (
    el.getAttribute('href') ??
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href') ??
    ''
  );
}

function maybeWrapWithClip(node: InterchangeNode, el: Element, ctx: ParseCtx): InterchangeNode {
  const clipRef = resolveUrlRef(el.getAttribute('clip-path'));
  if (!clipRef) return node;
  const clip = ctx.clipPaths.get(clipRef);
  if (!clip) return node;
  const wrapped = wrapChildrenInClipFrame([node], clip);
  return wrapped ?? node;
}

function parseVectorElement(el: Element, ctx: ParseCtx): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();
  const rawD = elementToPathData(el);
  if (!rawD) return null;

  const elMatrix = parseTransformMatrix(el.getAttribute('transform'));
  const worldMatrix = elMatrix
    ? new DOMMatrix().multiplySelf(ctx.parentMatrix).multiplySelf(elMatrix)
    : ctx.parentMatrix;

  let worldD: string;
  if (!isIdentityMatrix(worldMatrix)) {
    worldD = transformPathWithMatrix(rawD, worldMatrix);
  } else {
    worldD = rawD;
  }

  const { localD, bounds } = normalizePathData(worldD);
  if (bounds.width === 0 && bounds.height === 0) return null;

  const { fills, fillGradients, patternImage } = buildFills(el, ctx.gradients, ctx.patterns);

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

  const { strokes, strokeGradients } = buildStrokes(el, ctx.gradients);
  const allGradients = [...fillGradients, ...strokeGradients];

  const fillRule =
    el.getAttribute('fill-rule') === 'evenodd' ? ('evenodd' as const) : ('nonzero' as const);

  const opacity = el.getAttribute('opacity');
  const blendMode = parseBlendMode(el);

  let resolvedFills = fills;
  if (fills.length === 0 && fillGradients.length === 0) {
    const fillAttr = el.getAttribute('fill');
    if (fillAttr === 'none' || fillAttr === 'transparent') {
    } else if (fillAttr === null && ctx.inheritedFillNone) {
    } else if (fillAttr === null && ctx.inheritedFill) {
      const color = normalizeColor(ctx.inheritedFill);
      if (color) {
        const { hex, opacity: co } = colorToOpacity(color);
        resolvedFills = [{ color: hex, opacity: co, visible: true }];
      } else {
        resolvedFills = [{ color: '#000000', opacity: 1, visible: true }];
      }
    } else {
      resolvedFills = [{ color: '#000000', opacity: 1, visible: true }];
    }
  }

  let resolvedStrokes = strokes;
  if (strokes.length === 0 && el.getAttribute('stroke') === null && ctx.inheritedStroke) {
    const color = normalizeColor(ctx.inheritedStroke) ?? '#000000';
    const { hex, opacity: co } = colorToOpacity(color);
    const sw = ctx.inheritedStrokeWidth ?? 1;
    resolvedStrokes = [
      {
        color: hex,
        width: sw,
        opacity: co,
        visible: true,
        cap: 'butt' as InterchangeStrokeCap,
        join: 'miter' as InterchangeStrokeJoin,
        align: 'center',
        dashPattern: 'solid' as InterchangeDashPattern,
        dashOffset: 0,
        miterLimit: 4,
      },
    ];
  }

  const isRectLike = tagName === 'rect' && isIdentityMatrix(worldMatrix);
  const isEllipseLike =
    (tagName === 'circle' || tagName === 'ellipse') && isIdentityMatrix(worldMatrix);

  let node: InterchangeNode;

  if (isRectLike) {
    const rx = parseAttr(el, 'rx');
    node = createInterchangeNode('rectangle', {
      name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width || 1,
      height: bounds.height || 1,
      cornerRadius: rx,
      fills: resolvedFills,
      gradients: allGradients,
      strokes: resolvedStrokes,
      svgPathData: localD,
      opacity: opacity ? parseFloat(opacity) : 1,
      blendMode,
    });
  } else if (isEllipseLike) {
    node = createInterchangeNode('ellipse', {
      name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width || 1,
      height: bounds.height || 1,
      fills: resolvedFills,
      gradients: allGradients,
      strokes: resolvedStrokes,
      svgPathData: localD,
      opacity: opacity ? parseFloat(opacity) : 1,
      blendMode,
    });
  } else {
    node = createInterchangeNode('path', {
      name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? 'Vector',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width || 1,
      height: bounds.height || 1,
      fills: resolvedFills,
      gradients: allGradients,
      strokes: resolvedStrokes,
      svgPathData: localD,
      fillRule,
      opacity: opacity ? parseFloat(opacity) : 1,
      blendMode,
    });
  }

  return maybeWrapWithClip(node, el, ctx);
}

function parseTextElement(el: Element, ctx: ParseCtx): InterchangeNode {
  const elMatrix = parseTransformMatrix(el.getAttribute('transform'));
  const worldMatrix = elMatrix
    ? new DOMMatrix().multiplySelf(ctx.parentMatrix).multiplySelf(elMatrix)
    : ctx.parentMatrix;

  let x = parseAttr(el, 'x');
  let y = parseAttr(el, 'y');

  if (!isIdentityMatrix(worldMatrix)) {
    const pt = worldMatrix.transformPoint({ x, y });
    x = pt.x;
    y = pt.y;
  }

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

  const tspans = el.querySelectorAll('tspan');
  let content: string;
  if (tspans.length > 0) {
    const parts: string[] = [];
    for (const tspan of tspans) {
      parts.push(tspan.textContent ?? '');
    }
    content = parts.join('');
  } else {
    content = el.textContent ?? '';
  }

  const estimatedWidth = Math.max(200, content.length * fontSize * 0.6);
  const blendMode = parseBlendMode(el);
  const letterSpacing = parseAttr(el, 'letter-spacing', 0);

  const textDecorationStr = el.getAttribute('text-decoration');
  let textDecoration: 'none' | 'underline' | 'strikethrough' = 'none';
  if (textDecorationStr === 'underline') textDecoration = 'underline';
  else if (textDecorationStr === 'line-through') textDecoration = 'strikethrough';

  return createInterchangeNode('text', {
    name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
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
    letterSpacing,
    textDecoration,
    fills: [{ color: hex, opacity, visible: true }],
    opacity: el.getAttribute('opacity') ? parseFloat(el.getAttribute('opacity')!) : 1,
    blendMode,
  });
}

function parseImageElement(el: Element, ctx: ParseCtx): InterchangeNode {
  const elMatrix = parseTransformMatrix(el.getAttribute('transform'));
  const worldMatrix = elMatrix
    ? new DOMMatrix().multiplySelf(ctx.parentMatrix).multiplySelf(elMatrix)
    : ctx.parentMatrix;

  let x = parseAttr(el, 'x');
  let y = parseAttr(el, 'y');
  const width = parseAttr(el, 'width', 100);
  const height = parseAttr(el, 'height', 100);

  if (!isIdentityMatrix(worldMatrix)) {
    const pt = worldMatrix.transformPoint({ x, y });
    x = pt.x;
    y = pt.y;
  }

  const href = resolveHref(el);

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

function parseUseElement(el: Element, ctx: ParseCtx): InterchangeNode | null {
  const href = resolveHref(el);
  if (!href.startsWith('#')) return null;

  const refId = href.slice(1);
  const refEl = el.ownerDocument.getElementById(refId) ?? ctx.symbols.get(refId);
  if (!refEl) return null;

  const useX = parseAttr(el, 'x');
  const useY = parseAttr(el, 'y');
  const useWidth = el.getAttribute('width') ? parseAttr(el, 'width') : null;
  const useHeight = el.getAttribute('height') ? parseAttr(el, 'height') : null;

  const useMatrix = parseTransformMatrix(el.getAttribute('transform'));
  const translateMatrix = new DOMMatrix().translateSelf(useX, useY);

  const combined = new DOMMatrix()
    .multiplySelf(ctx.parentMatrix)
    .multiplySelf(useMatrix ?? new DOMMatrix())
    .multiplySelf(translateMatrix);

  if (refEl.tagName.toLowerCase() === 'symbol') {
    const viewBox = refEl.getAttribute('viewBox');
    let svgWidth = useWidth ?? parseAttr(refEl, 'width', 100);
    let svgHeight = useHeight ?? parseAttr(refEl, 'height', 100);

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
        if (svgWidth <= 0) svgWidth = parts[2]!;
        if (svgHeight <= 0) svgHeight = parts[3]!;

        if (useWidth !== null && useHeight !== null) {
          const scaleX = useWidth / parts[2]!;
          const scaleY = useHeight / parts[3]!;
          combined.translateSelf(-parts[0]!, -parts[1]!);
          combined.scaleSelf(scaleX, scaleY);
        }
      }
    }

    const childCtx: ParseCtx = { ...ctx, parentMatrix: combined };
    const children: InterchangeNode[] = [];
    for (const child of refEl.children) {
      const parsed = parseElement(child, childCtx);
      if (parsed) children.push(parsed);
    }
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!;

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
      name: refEl.getAttribute('id') ?? '',
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      children,
    });
  }

  const childCtx: ParseCtx = { ...ctx, parentMatrix: combined };
  return parseElement(refEl, childCtx);
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

const VECTOR_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

function parseElement(el: Element, ctx: ParseCtx): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tagName)) return null;

  const display = el.getAttribute('display');
  if (display === 'none') return null;
  const visibility = el.getAttribute('visibility');
  if (visibility === 'hidden' || visibility === 'collapse') return null;

  if (tagName === 'use') {
    return parseUseElement(el, ctx);
  }

  const ownFill = el.getAttribute('fill');
  const childCtx: ParseCtx = {
    ...ctx,
    inheritedFillNone: ownFill === 'none' || (ownFill === null && ctx.inheritedFillNone),
  };

  if (VECTOR_TAGS.has(tagName)) {
    return parseVectorElement(el, ctx);
  }

  if (tagName === 'text') {
    return parseTextElement(el, ctx);
  }

  if (tagName === 'image') {
    return parseImageElement(el, ctx);
  }

  if (tagName === 'g' || tagName === 'a' || tagName === 'svg') {
    const groupMatrix = parseTransformMatrix(el.getAttribute('transform'));
    let worldMatrix = groupMatrix
      ? new DOMMatrix().multiplySelf(ctx.parentMatrix).multiplySelf(groupMatrix)
      : new DOMMatrix().multiplySelf(ctx.parentMatrix);

    if (tagName === 'svg') {
      const nestedViewBox = el.getAttribute('viewBox');
      let nestedWidth = parseAttr(el, 'width', 0);
      let nestedHeight = parseAttr(el, 'height', 0);
      if (nestedViewBox) {
        const parts = nestedViewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
          const vbX = parts[0]!;
          const vbY = parts[1]!;
          const vbW = parts[2]!;
          const vbH = parts[3]!;
          if (nestedWidth <= 0) nestedWidth = vbW;
          if (nestedHeight <= 0) nestedHeight = vbH;
          if (nestedWidth !== vbW || nestedHeight !== vbH) {
            worldMatrix = worldMatrix.scaleSelf(nestedWidth / vbW, nestedHeight / vbH);
          }
          if (vbX !== 0 || vbY !== 0) {
            worldMatrix = worldMatrix.translateSelf(-vbX, -vbY);
          }
        }
      }
      const nestedX = parseAttr(el, 'x', 0);
      const nestedY = parseAttr(el, 'y', 0);
      if (nestedX !== 0 || nestedY !== 0) {
        worldMatrix = new DOMMatrix()
          .multiplySelf(ctx.parentMatrix)
          .translateSelf(nestedX, nestedY)
          .multiplySelf(groupMatrix ? new DOMMatrix().multiplySelf(groupMatrix) : new DOMMatrix());
      }
    }

    const groupFill = el.getAttribute('fill');
    const groupStroke = el.getAttribute('stroke');
    const groupStrokeWidth = el.getAttribute('stroke-width');

    const groupCtx: ParseCtx = {
      ...childCtx,
      parentMatrix: worldMatrix,
      inheritedFill: groupFill ?? ctx.inheritedFill,
      inheritedStroke: groupStroke ?? ctx.inheritedStroke,
      inheritedStrokeWidth: groupStrokeWidth
        ? parseFloat(groupStrokeWidth)
        : ctx.inheritedStrokeWidth,
    };

    const children: InterchangeNode[] = [];
    for (const child of el.children) {
      const parsed = parseElement(child, groupCtx);
      if (parsed) children.push(parsed);
    }

    if (children.length === 0) return null;

    const opacity = parseFloat(el.getAttribute('opacity') ?? '1');
    const groupOpacity = Number.isFinite(opacity) ? opacity : 1;
    const blendMode = parseBlendMode(el);
    const filterRef = resolveUrlRef(el.getAttribute('filter'));
    const groupEffects = filterRef ? ctx.filters.get(filterRef) : undefined;
    const clipRef = resolveUrlRef(el.getAttribute('clip-path'));
    const maskRef = resolveUrlRef(el.getAttribute('mask'));
    const clip =
      (clipRef ? ctx.clipPaths.get(clipRef) : undefined) ??
      (maskRef ? ctx.masks.get(maskRef) : undefined);

    if (groupEffects) {
      for (const child of children) {
        applyEffectsToNode(child, groupEffects, 1);
      }
    }

    if (clip) {
      const clipped = wrapChildrenInClipFrame(children, clip);
      if (clipped) {
        clipped.blendMode = blendMode;
        clipped.opacity = groupOpacity;
        return clipped;
      }
    }

    if (children.length === 1 && groupOpacity >= 1) {
      const child = children[0]!;
      if (blendMode !== 'normal') child.blendMode = blendMode;
      return child;
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
      opacity: groupOpacity,
      blendMode,
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
  const symbols = resolveSymbols(doc);

  const svgFill = svgEl.getAttribute('fill');

  const widthAttr = parseAttr(svgEl, 'width', 0);
  const heightAttr = parseAttr(svgEl, 'height', 0);
  const viewBox = svgEl.getAttribute('viewBox');

  let svgWidth = widthAttr;
  let svgHeight = heightAttr;
  let rootMatrix = new DOMMatrix();

  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      const vbX = parts[0]!;
      const vbY = parts[1]!;
      const vbW = parts[2]!;
      const vbH = parts[3]!;

      if (svgWidth <= 0) svgWidth = vbW;
      if (svgHeight <= 0) svgHeight = vbH;

      if (svgWidth !== vbW || svgHeight !== vbH) {
        const scaleX = svgWidth / vbW;
        const scaleY = svgHeight / vbH;
        rootMatrix = rootMatrix.scaleSelf(scaleX, scaleY);
      }
      if (vbX !== 0 || vbY !== 0) {
        rootMatrix = rootMatrix.translateSelf(-vbX, -vbY);
      }
    }
  }
  if (svgWidth <= 0) svgWidth = 100;
  if (svgHeight <= 0) svgHeight = 100;

  const ctx: ParseCtx = {
    gradients,
    patterns,
    clipPaths,
    masks,
    filters,
    symbols,
    inheritedFillNone: svgFill === 'none',
    inheritedFill: svgFill && svgFill !== 'none' ? svgFill : null,
    inheritedStroke: null,
    inheritedStrokeWidth: null,
    parentMatrix: rootMatrix,
  };

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
