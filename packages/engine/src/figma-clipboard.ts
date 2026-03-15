import type * as Y from 'yjs';
import { inflate } from 'pako';
import { addShape } from './scene-graph';
import { computeArrowHead } from './shape-renderer';

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

interface ParsedSvgShape {
  type: 'rectangle' | 'ellipse' | 'text' | 'path';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  content?: string;
  cornerRadius?: number;
}

function parseSvgShapes(svg: string): ParsedSvgShape[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const shapes: ParsedSvgShape[] = [];

  const rects = doc.querySelectorAll('rect');
  for (const rect of rects) {
    shapes.push({
      type: 'rectangle',
      x: parseFloat(rect.getAttribute('x') ?? '0'),
      y: parseFloat(rect.getAttribute('y') ?? '0'),
      width: parseFloat(rect.getAttribute('width') ?? '100'),
      height: parseFloat(rect.getAttribute('height') ?? '100'),
      fill: rect.getAttribute('fill') ?? '#D9D9D9',
      stroke: rect.getAttribute('stroke'),
      strokeWidth: parseFloat(rect.getAttribute('stroke-width') ?? '0'),
      cornerRadius: parseFloat(rect.getAttribute('rx') ?? '0'),
    });
  }

  const ellipses = doc.querySelectorAll('ellipse, circle');
  for (const el of ellipses) {
    const cx = parseFloat(el.getAttribute('cx') ?? '0');
    const cy = parseFloat(el.getAttribute('cy') ?? '0');
    const rx = parseFloat(el.getAttribute('rx') ?? el.getAttribute('r') ?? '50');
    const ry = parseFloat(el.getAttribute('ry') ?? el.getAttribute('r') ?? '50');
    shapes.push({
      type: 'ellipse',
      x: cx - rx,
      y: cy - ry,
      width: rx * 2,
      height: ry * 2,
      fill: el.getAttribute('fill') ?? '#D9D9D9',
      stroke: el.getAttribute('stroke'),
      strokeWidth: parseFloat(el.getAttribute('stroke-width') ?? '0'),
    });
  }

  const texts = doc.querySelectorAll('text');
  for (const text of texts) {
    shapes.push({
      type: 'text',
      x: parseFloat(text.getAttribute('x') ?? '0'),
      y: parseFloat(text.getAttribute('y') ?? '0'),
      width: 200,
      height: 24,
      fill: text.getAttribute('fill') ?? '#000000',
      stroke: null,
      strokeWidth: 0,
      content: text.textContent ?? '',
    });
  }

  return shapes;
}

export function importSvgShapes(ydoc: Y.Doc, svg: string): string[] {
  const parsed = parseSvgShapes(svg);
  const ids: string[] = [];

  for (const shape of parsed) {
    const id = addShape(ydoc, shape.type, {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
      ...(shape.content !== undefined ? { content: shape.content } : {}),
      ...(shape.cornerRadius !== undefined ? { cornerRadius: shape.cornerRadius } : {}),
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

export function handlePaste(ydoc: Y.Doc, html: string | null, text: string | null): string[] {
  const source = detectPasteSource(html, text);

  switch (source) {
    case 'figma': {
      if (!html) return [];
      const svgInFigma = html.match(/<svg[\s\S]*?<\/svg>/i)?.[0];
      if (svgInFigma) {
        return importSvgShapes(ydoc, svgInFigma);
      }
      return [];
    }
    case 'svg': {
      if (!html) return [];
      const svg = extractSvgFromHtml(html);
      if (svg) return importSvgShapes(ydoc, svg);
      return [];
    }
    case 'draftila': {
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        const ids: string[] = [];
        for (const shape of parsed.shapes) {
          const { id: _id, ...rest } = shape;
          const newId = addShape(ydoc, shape.type, {
            ...rest,
            x: shape.x + 20,
            y: shape.y + 20,
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
      const id = addShape(ydoc, 'text', {
        x: 100,
        y: 100,
        width: 200,
        height: 24,
        content: text,
      });
      return [id];
    }
    default:
      return [];
  }
}

export function shapesToSvg(
  shapes: Array<{
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string | null;
    stroke?: string | null;
    strokeWidth?: number;
    cornerRadius?: number;
    content?: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    startArrowhead?: boolean;
    endArrowhead?: boolean;
  }>,
): string {
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
  const elements: string[] = [];

  for (const s of shapes) {
    const rx = s.x - minX;
    const ry = s.y - minY;
    const fill = s.fill ?? 'none';
    const stroke = s.stroke ?? 'none';
    const sw = s.strokeWidth ?? 0;

    switch (s.type) {
      case 'rectangle':
        elements.push(
          `<rect x="${rx}" y="${ry}" width="${s.width}" height="${s.height}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${s.cornerRadius ? ` rx="${s.cornerRadius}"` : ''}/>`,
        );
        break;
      case 'ellipse':
        elements.push(
          `<ellipse cx="${rx + s.width / 2}" cy="${ry + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
        );
        break;
      case 'frame':
        elements.push(
          `<rect x="${rx}" y="${ry}" width="${s.width}" height="${s.height}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
        );
        break;
      case 'text':
        elements.push(
          `<text x="${rx}" y="${ry + 16}" fill="${fill}" font-size="16" font-family="Inter">${s.content ?? ''}</text>`,
        );
        break;
      case 'line':
        if (s.x1 !== undefined && s.y1 !== undefined && s.x2 !== undefined && s.y2 !== undefined) {
          const lx1 = s.x1 - minX;
          const ly1 = s.y1 - minY;
          const lx2 = s.x2 - minX;
          const ly2 = s.y2 - minY;
          elements.push(
            `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
          );
        }
        break;
      case 'arrow':
        if (s.x1 !== undefined && s.y1 !== undefined && s.x2 !== undefined && s.y2 !== undefined) {
          const ax1 = s.x1 - minX;
          const ay1 = s.y1 - minY;
          const ax2 = s.x2 - minX;
          const ay2 = s.y2 - minY;
          elements.push(
            `<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
          );
          if (s.endArrowhead !== false) {
            const end = computeArrowHead(ax2, ay2, ax1, ay1, sw);
            elements.push(
              `<polyline points="${end.left[0]},${end.left[1]} ${end.tip[0]},${end.tip[1]} ${end.right[0]},${end.right[1]}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
            );
          }
          if (s.startArrowhead) {
            const start = computeArrowHead(ax1, ay1, ax2, ay2, sw);
            elements.push(
              `<polyline points="${start.left[0]},${start.left[1]} ${start.tip[0]},${start.tip[1]} ${start.right[0]},${start.right[1]}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
            );
          }
        }
        break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${elements.join('')}</svg>`;
}
