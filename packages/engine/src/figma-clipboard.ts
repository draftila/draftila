import type * as Y from 'yjs';
import type { Fill, Point, Shape, Stroke, StrokeDashPattern } from '@draftila/shared';
import { inflate } from 'pako';
import getStroke from 'perfect-freehand';
import { addShape } from './scene-graph';
import { computeArrowHead, generatePolygonPoints, generateStarPoints } from './shape-renderer';

export interface ExternalPasteOptions {
  targetParentId?: string | null;
  cursorPosition?: Point | null;
}

const FIGMETA_REGEX = /<!--\(figmeta\)([\s\S]*?)\(\/figmeta\)-->/;
const FIGMA_REGEX = /<!--\(figma\)([\s\S]*?)\(\/figma\)-->/;

export interface FigmaMeta {
  fileKey: string;
  pasteID: number;
  dataType: string;
}

export function isFigmaClipboard(html: string): boolean {
  return FIGMETA_REGEX.test(html);
}

export function parseFigmaMeta(html: string): FigmaMeta | null {
  const match = html.match(FIGMETA_REGEX);
  if (!match?.[1]) return null;

  try {
    const decoded = atob(match[1].trim());
    return JSON.parse(decoded) as FigmaMeta;
  } catch {
    return null;
  }
}

export function parseFigmaBinary(html: string): unknown[] {
  const match = html.match(FIGMA_REGEX);
  if (!match?.[1]) return [];

  try {
    const base64 = match[1].trim();
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const magicStr = new TextDecoder().decode(binary.slice(0, 9));
    if (magicStr !== 'fig-kiwij' && magicStr !== 'fig-kiwi\0') {
      return [];
    }

    const headerSize = magicStr === 'fig-kiwij' ? 12 : 12;
    let offset = headerSize;

    const schemaLen = new DataView(binary.buffer, binary.byteOffset).getUint32(offset, true);
    offset += 4;
    const _compressedSchema = binary.slice(offset, offset + schemaLen);
    offset += schemaLen;

    const dataLen = new DataView(binary.buffer, binary.byteOffset).getUint32(offset, true);
    offset += 4;
    const compressedData = binary.slice(offset, offset + dataLen);

    try {
      const _decompressed = inflate(compressedData);
    } catch {
      // May not be standard deflate
    }

    return [];
  } catch {
    return [];
  }
}

function extractSvgFromHtml(html: string): string | null {
  const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
  return svgMatch?.[0] ?? null;
}

function svgColorToFill(color: string | null, fallback: string): Fill[] {
  if (!color || color === 'none') return [];
  return [{ color, opacity: 1, visible: true }];
}

function svgStrokeToStrokes(color: string | null, width: number): Stroke[] {
  if (!color || color === 'none' || width <= 0) return [];
  return [
    {
      color,
      width,
      opacity: 1,
      visible: true,
      cap: 'butt',
      join: 'miter',
      align: 'center',
      dashPattern: 'solid',
      dashOffset: 0,
      miterLimit: 4,
    },
  ];
}

interface ParsedSvgShape {
  type: 'rectangle' | 'ellipse' | 'text' | 'path';
  x: number;
  y: number;
  width: number;
  height: number;
  fills: Fill[];
  strokes: Stroke[];
  content?: string;
  cornerRadius?: number;
}

function parseSvgShapes(svg: string): ParsedSvgShape[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const shapes: ParsedSvgShape[] = [];

  const rects = doc.querySelectorAll('rect');
  for (const rect of rects) {
    const fillAttr = rect.getAttribute('fill');
    const strokeAttr = rect.getAttribute('stroke');
    const sw = parseFloat(rect.getAttribute('stroke-width') ?? '0');
    shapes.push({
      type: 'rectangle',
      x: parseFloat(rect.getAttribute('x') ?? '0'),
      y: parseFloat(rect.getAttribute('y') ?? '0'),
      width: parseFloat(rect.getAttribute('width') ?? '100'),
      height: parseFloat(rect.getAttribute('height') ?? '100'),
      fills: svgColorToFill(fillAttr, '#D9D9D9'),
      strokes: svgStrokeToStrokes(strokeAttr, sw),
      cornerRadius: parseFloat(rect.getAttribute('rx') ?? '0'),
    });
  }

  const ellipses = doc.querySelectorAll('ellipse, circle');
  for (const el of ellipses) {
    const cx = parseFloat(el.getAttribute('cx') ?? '0');
    const cy = parseFloat(el.getAttribute('cy') ?? '0');
    const rx = parseFloat(el.getAttribute('rx') ?? el.getAttribute('r') ?? '50');
    const ry = parseFloat(el.getAttribute('ry') ?? el.getAttribute('r') ?? '50');
    const fillAttr = el.getAttribute('fill');
    const strokeAttr = el.getAttribute('stroke');
    const sw = parseFloat(el.getAttribute('stroke-width') ?? '0');
    shapes.push({
      type: 'ellipse',
      x: cx - rx,
      y: cy - ry,
      width: rx * 2,
      height: ry * 2,
      fills: svgColorToFill(fillAttr, '#D9D9D9'),
      strokes: svgStrokeToStrokes(strokeAttr, sw),
    });
  }

  const texts = doc.querySelectorAll('text');
  for (const text of texts) {
    const fillAttr = text.getAttribute('fill');
    shapes.push({
      type: 'text',
      x: parseFloat(text.getAttribute('x') ?? '0'),
      y: parseFloat(text.getAttribute('y') ?? '0'),
      width: 200,
      height: 24,
      fills: svgColorToFill(fillAttr, '#000000'),
      strokes: [],
      content: text.textContent ?? '',
    });
  }

  return shapes;
}

function computeShapesOffset(
  shapes: { x: number; y: number; width: number; height: number }[],
  cursorPosition: Point | null | undefined,
): { offsetX: number; offsetY: number } {
  if (!cursorPosition || shapes.length === 0) return { offsetX: 0, offsetY: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  return {
    offsetX: cursorPosition.x - (minX + maxX) / 2,
    offsetY: cursorPosition.y - (minY + maxY) / 2,
  };
}

export function importSvgShapes(
  ydoc: Y.Doc,
  svg: string,
  options?: ExternalPasteOptions,
): string[] {
  const parsed = parseSvgShapes(svg);
  const ids: string[] = [];
  const targetParentId = options?.targetParentId ?? null;
  const { offsetX, offsetY } = computeShapesOffset(parsed, options?.cursorPosition);

  for (const shape of parsed) {
    const id = addShape(ydoc, shape.type, {
      x: shape.x + offsetX,
      y: shape.y + offsetY,
      width: shape.width,
      height: shape.height,
      fills: shape.fills,
      ...(shape.type !== 'text' ? { strokes: shape.strokes } : {}),
      ...(shape.content !== undefined ? { content: shape.content } : {}),
      ...(shape.cornerRadius !== undefined ? { cornerRadius: shape.cornerRadius } : {}),
      parentId: targetParentId,
    });
    ids.push(id);
  }

  return ids;
}

export type PasteSource = 'figma' | 'svg' | 'draftila' | 'text' | 'unknown';

export function detectPasteSource(html: string | null, text: string | null): PasteSource {
  if (html && isFigmaClipboard(html)) return 'figma';
  if (html && html.includes('<svg')) return 'svg';
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.type === 'draftila/shapes') return 'draftila';
    } catch {
      // Not JSON
    }
    return 'text';
  }
  return 'unknown';
}

export function handlePaste(
  ydoc: Y.Doc,
  html: string | null,
  text: string | null,
  options?: ExternalPasteOptions,
): string[] {
  const source = detectPasteSource(html, text);
  const targetParentId = options?.targetParentId ?? null;
  const cursorPosition = options?.cursorPosition;

  switch (source) {
    case 'figma': {
      if (!html) return [];
      const svgInFigma = html.match(/<svg[\s\S]*?<\/svg>/i)?.[0];
      if (svgInFigma) {
        return importSvgShapes(ydoc, svgInFigma, options);
      }
      return [];
    }
    case 'svg': {
      if (!html) return [];
      const svg = extractSvgFromHtml(html);
      if (svg) return importSvgShapes(ydoc, svg, options);
      return [];
    }
    case 'draftila': {
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        const shapes = parsed.shapes as Shape[];
        const { offsetX, offsetY } = computeShapesOffset(shapes, cursorPosition);
        const ids: string[] = [];
        for (const shape of shapes) {
          const { id: _id, ...rest } = shape;
          const newId = addShape(ydoc, shape.type, {
            ...rest,
            x: shape.x + offsetX,
            y: shape.y + offsetY,
            parentId: targetParentId,
          });
          ids.push(newId);
        }
        return ids;
      } catch {
        return [];
      }
    }
    case 'text': {
      if (!text) return [];
      const textX = cursorPosition?.x ?? 100;
      const textY = cursorPosition?.y ?? 100;
      const id = addShape(ydoc, 'text', {
        x: textX,
        y: textY,
        width: 200,
        height: 24,
        content: text,
        parentId: targetParentId,
      });
      return [id];
    }
    default:
      return [];
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function svgColor(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  if (opacity <= 0) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function dashPatternToSvg(pattern: StrokeDashPattern, strokeWidth: number): string {
  switch (pattern) {
    case 'dash':
      return `${strokeWidth * 4},${strokeWidth * 2}`;
    case 'dot':
      return `${strokeWidth},${strokeWidth * 2}`;
    case 'dash-dot':
      return `${strokeWidth * 4},${strokeWidth * 2},${strokeWidth},${strokeWidth * 2}`;
    default:
      return '';
  }
}

function buildFillAttrs(fills: Fill[]): string {
  const visible = fills.find((f) => f.visible);
  if (!visible) return ' fill="none"';
  const color = svgColor(visible.color, visible.opacity);
  return ` fill="${color}"`;
}

function buildStrokeAttrs(strokes: Stroke[]): string {
  const visible = strokes.find((s) => s.visible);
  if (!visible || visible.width <= 0) return ' stroke="none" stroke-width="0"';
  const color = svgColor(visible.color, visible.opacity);
  let attrs = ` stroke="${color}" stroke-width="${visible.width}"`;
  if (visible.cap && visible.cap !== 'butt') attrs += ` stroke-linecap="${visible.cap}"`;
  if (visible.join && visible.join !== 'miter') attrs += ` stroke-linejoin="${visible.join}"`;
  const dash = dashPatternToSvg(visible.dashPattern ?? 'solid', visible.width);
  if (dash) attrs += ` stroke-dasharray="${dash}"`;
  if (visible.dashOffset) attrs += ` stroke-dashoffset="${visible.dashOffset}"`;
  return attrs;
}

function primaryStrokeWidth(strokes: Stroke[]): number {
  const visible = strokes.find((s) => s.visible);
  return visible?.width ?? 0;
}

function buildShadowFilter(shape: Shape, filterId: string): string | null {
  const shadows = ('shadows' in shape ? (shape.shadows as Shape['shadows']) : undefined) ?? [];
  const dropShadows = shadows.filter((s) => s.type === 'drop' && s.visible);
  if (dropShadows.length === 0) return null;

  const parts: string[] = [
    `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">`,
  ];
  for (let i = 0; i < dropShadows.length; i++) {
    const shadow = dropShadows[i]!;
    const r = parseInt(shadow.color.slice(1, 3), 16);
    const g = parseInt(shadow.color.slice(3, 5), 16);
    const b = parseInt(shadow.color.slice(5, 7), 16);
    const a = shadow.color.length > 7 ? parseInt(shadow.color.slice(7, 9), 16) / 255 : 1;
    parts.push(
      `<feDropShadow dx="${shadow.x}" dy="${shadow.y}" stdDeviation="${shadow.blur / 2}" flood-color="rgb(${r},${g},${b})" flood-opacity="${a}"/>`,
    );
  }
  parts.push('</filter>');
  return parts.join('');
}

function buildGroupOpen(shape: Shape, ox: number, oy: number, filterId: string | null): string {
  const attrs: string[] = [];
  if (shape.opacity < 1) attrs.push(`opacity="${shape.opacity}"`);
  if (filterId) attrs.push(`filter="url(#${filterId})"`);

  const rotation = shape.rotation;
  if (rotation !== 0) {
    const cx = ox + shape.width / 2;
    const cy = oy + shape.height / 2;
    attrs.push(`transform="rotate(${(rotation * 180) / Math.PI},${cx},${cy})"`);
  }

  if (attrs.length === 0) return '';
  return `<g ${attrs.join(' ')}>`;
}

function buildGroupClose(shape: Shape, filterId: string | null): string {
  const hasGroup = shape.opacity < 1 || shape.rotation !== 0 || filterId !== null;
  return hasGroup ? '</g>' : '';
}

function pointsToSvgPolygon(points: Array<[number, number]>): string {
  return points.map((p) => `${p[0]},${p[1]}`).join(' ');
}

function freehandPathToSvgD(outlinePoints: Array<[number, number]>): string {
  if (outlinePoints.length === 0) return '';
  const [first, ...rest] = outlinePoints;
  let d = `M ${first![0]} ${first![1]}`;
  for (const p of rest) {
    d += ` L ${p[0]} ${p[1]}`;
  }
  d += ' Z';
  return d;
}

function rectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): string {
  tl = Math.min(tl, w / 2, h / 2);
  tr = Math.min(tr, w / 2, h / 2);
  br = Math.min(br, w / 2, h / 2);
  bl = Math.min(bl, w / 2, h / 2);
  return [
    `M ${x + tl} ${y}`,
    `L ${x + w - tr} ${y}`,
    tr > 0 ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : '',
    `L ${x + w} ${y + h - br}`,
    br > 0 ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : '',
    `L ${x + bl} ${y + h}`,
    bl > 0 ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : '',
    `L ${x} ${y + tl}`,
    tl > 0 ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

export function shapesToSvg(shapes: Shape[]): string {
  if (shapes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const defs: string[] = [];
  const elements: string[] = [];

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i]!;
    const ox = s.x - minX;
    const oy = s.y - minY;
    const fills = ('fills' in s ? s.fills : undefined) ?? [];
    const strokes = ('strokes' in s ? s.strokes : undefined) ?? [];

    const filterId = `shadow-${i}`;
    const filterDef = buildShadowFilter(s, filterId);
    const activeFilterId = filterDef ? filterId : null;
    if (filterDef) defs.push(filterDef);

    const gOpen = buildGroupOpen(s, ox, oy, activeFilterId);
    const gClose = buildGroupClose(s, activeFilterId);
    const fillAttrs = buildFillAttrs(fills);
    const strokeAttrs = buildStrokeAttrs(strokes);

    switch (s.type) {
      case 'rectangle': {
        const hasIndependent =
          s.cornerRadiusTL !== undefined ||
          s.cornerRadiusTR !== undefined ||
          s.cornerRadiusBL !== undefined ||
          s.cornerRadiusBR !== undefined;

        if (hasIndependent) {
          const tl = s.cornerRadiusTL ?? s.cornerRadius;
          const tr = s.cornerRadiusTR ?? s.cornerRadius;
          const br = s.cornerRadiusBR ?? s.cornerRadius;
          const bl = s.cornerRadiusBL ?? s.cornerRadius;
          const d = rectPath(ox, oy, s.width, s.height, tl, tr, br, bl);
          elements.push(`${gOpen}<path d="${d}"${fillAttrs}${strokeAttrs}/>${gClose}`);
        } else {
          const cr = s.cornerRadius;
          elements.push(
            `${gOpen}<rect x="${ox}" y="${oy}" width="${s.width}" height="${s.height}"${fillAttrs}${strokeAttrs}${cr ? ` rx="${cr}"` : ''}/>${gClose}`,
          );
        }
        break;
      }
      case 'ellipse': {
        elements.push(
          `${gOpen}<ellipse cx="${ox + s.width / 2}" cy="${oy + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}"${fillAttrs}${strokeAttrs}/>${gClose}`,
        );
        break;
      }
      case 'frame': {
        elements.push(
          `${gOpen}<rect x="${ox}" y="${oy}" width="${s.width}" height="${s.height}"${fillAttrs}${strokeAttrs}/>${gClose}`,
        );
        break;
      }
      case 'text': {
        const fontSize = s.fontSize;
        const fontFamily = s.fontFamily;
        const fontWeight = s.fontWeight;
        const fontStyle = s.fontStyle !== 'normal' ? ` font-style="${s.fontStyle}"` : '';
        const textAnchor =
          s.textAlign === 'center'
            ? ' text-anchor="middle"'
            : s.textAlign === 'right'
              ? ' text-anchor="end"'
              : '';
        const textX =
          s.textAlign === 'center' ? ox + s.width / 2 : s.textAlign === 'right' ? ox + s.width : ox;
        const decoration =
          s.textDecoration === 'underline'
            ? ' text-decoration="underline"'
            : s.textDecoration === 'strikethrough'
              ? ' text-decoration="line-through"'
              : '';
        const letterSpacing = s.letterSpacing ? ` letter-spacing="${s.letterSpacing}"` : '';
        const content =
          s.textTransform === 'uppercase'
            ? (s.content ?? '').toUpperCase()
            : s.textTransform === 'lowercase'
              ? (s.content ?? '').toLowerCase()
              : (s.content ?? '');

        elements.push(
          `${gOpen}<text x="${textX}" y="${oy + fontSize}" font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" font-weight="${fontWeight}"${fontStyle}${textAnchor}${decoration}${letterSpacing}${fillAttrs}>${escapeXml(content)}</text>${gClose}`,
        );
        break;
      }
      case 'polygon': {
        const cx = ox + s.width / 2;
        const cy = oy + s.height / 2;
        const pts = generatePolygonPoints(cx, cy, s.width / 2, s.height / 2, s.sides);
        elements.push(
          `${gOpen}<polygon points="${pointsToSvgPolygon(pts)}"${fillAttrs}${strokeAttrs}/>${gClose}`,
        );
        break;
      }
      case 'star': {
        const starCx = ox + s.width / 2;
        const starCy = oy + s.height / 2;
        const starPts = generateStarPoints(
          starCx,
          starCy,
          s.width / 2,
          s.height / 2,
          s.points as number,
          s.innerRadius,
        );
        elements.push(
          `${gOpen}<polygon points="${pointsToSvgPolygon(starPts)}"${fillAttrs}${strokeAttrs}/>${gClose}`,
        );
        break;
      }
      case 'path': {
        if (s.points.length < 2) break;
        const inputPoints = s.points.map(
          (p) => [p.x + ox, p.y + oy, p.pressure] as [number, number, number],
        );
        const sw = primaryStrokeWidth(strokes);
        const strokePoints = getStroke(inputPoints, {
          size: sw > 0 ? sw : 4,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
          simulatePressure: true,
        });
        const outlinePoints = strokePoints.map((p) => [p[0]!, p[1]!] as [number, number]);
        if (outlinePoints.length > 0) {
          const d = freehandPathToSvgD(outlinePoints);
          elements.push(`${gOpen}<path d="${d}"${fillAttrs} stroke="none"/>${gClose}`);
        }
        break;
      }
      case 'line': {
        const lx1 = s.x1 - minX;
        const ly1 = s.y1 - minY;
        const lx2 = s.x2 - minX;
        const ly2 = s.y2 - minY;
        elements.push(
          `${gOpen}<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}"${strokeAttrs} stroke-linecap="round"/>${gClose}`,
        );
        break;
      }
      case 'arrow': {
        const ax1 = s.x1 - minX;
        const ay1 = s.y1 - minY;
        const ax2 = s.x2 - minX;
        const ay2 = s.y2 - minY;
        const sw = primaryStrokeWidth(strokes);
        let arrowContent = `<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}"${strokeAttrs} stroke-linecap="round"/>`;
        if (s.endArrowhead) {
          const end = computeArrowHead(ax2, ay2, ax1, ay1, sw);
          arrowContent += `<polyline points="${end.left[0]},${end.left[1]} ${end.tip[0]},${end.tip[1]} ${end.right[0]},${end.right[1]}" fill="none"${strokeAttrs} stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        if (s.startArrowhead) {
          const start = computeArrowHead(ax1, ay1, ax2, ay2, sw);
          arrowContent += `<polyline points="${start.left[0]},${start.left[1]} ${start.tip[0]},${start.tip[1]} ${start.right[0]},${start.right[1]}" fill="none"${strokeAttrs} stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        elements.push(`${gOpen}${arrowContent}${gClose}`);
        break;
      }
      case 'image': {
        elements.push(
          `${gOpen}<rect x="${ox}" y="${oy}" width="${s.width}" height="${s.height}" fill="#E0E0E0" stroke="#BDBDBD" stroke-width="1"/>${gClose}`,
        );
        break;
      }
      case 'group': {
        break;
      }
    }
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defsBlock}${elements.join('')}</svg>`;
}
