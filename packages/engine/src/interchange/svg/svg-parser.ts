import { optimize } from 'svgo';
import type { InterchangeDocument, InterchangeNode } from '../interchange-format';
import { createInterchangeDocument, createInterchangeNode } from '../interchange-format';
import { parseAttr } from './parser/shared';
import type { ParseCtx } from './parser/types';
import type { ParseSvgOptions } from './parser/types';
import {
  resolveClipPaths,
  resolveFilters,
  resolveGradients,
  resolveMasks,
  resolvePatterns,
  resolveSymbols,
} from './parser/defs';
import { parseElement } from './parser/elements';

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

function parseSvgViewportSize(svgEl: Element): { width: number; height: number } {
  let width = parseAttr(svgEl, 'width', 0);
  let height = parseAttr(svgEl, 'height', 0);
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
