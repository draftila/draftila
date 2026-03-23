import type {
  InterchangeNode,
  InterchangeStrokeCap,
  InterchangeStrokeJoin,
  InterchangeDashPattern,
} from '../../interchange-format';
import type { TextAutoResize, TextSegment } from '@draftila/shared';
import { createInterchangeNode } from '../../interchange-format';
import { normalizeColor, colorToOpacity } from '../color';
import { ParseCtx } from './types';
import {
  getPresentationAttr,
  parseAttr,
  parseBlendMode,
  resolveHref,
  resolveUrlRef,
} from './shared';
import { buildFills, buildStrokes } from './paint';
import { elementToPathData, normalizePathData, transformPathWithMatrix } from './path-utils';
import {
  decomposeTransform,
  isIdentityMatrix,
  isRectilinearTransform,
  parseTransformMatrix,
} from './transforms';
import { applyEffectsToNode, wrapChildrenInClipFrame } from './defs';

function createTransformedShapeBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  matrix: DOMMatrix,
): { x: number; y: number; width: number; height: number; rotation: number } {
  const center = matrix.transformPoint({ x: x + width / 2, y: y + height / 2 });
  const { rotation, sx, sy } = decomposeTransform(matrix);
  const transformedWidth = Math.max(Math.abs(width * sx), 1);
  const transformedHeight = Math.max(Math.abs(height * sy), 1);
  return {
    x: center.x - transformedWidth / 2,
    y: center.y - transformedHeight / 2,
    width: transformedWidth,
    height: transformedHeight,
    rotation,
  };
}

function extractTextSegments(el: Element): { content: string; segments?: TextSegment[] } {
  const tspans = Array.from(el.querySelectorAll('tspan'));
  if (tspans.length === 0) {
    return { content: el.textContent ?? '' };
  }

  const segments: TextSegment[] = [];
  let content = '';

  for (let index = 0; index < tspans.length; index++) {
    const tspan = tspans[index]!;
    const text = tspan.textContent ?? '';
    const startsNewLine =
      index > 0 &&
      (getPresentationAttr(tspan, 'x') !== null || getPresentationAttr(tspan, 'dy') !== null);

    if (startsNewLine && !content.endsWith('\n')) {
      content += '\n';
    }

    content += text;

    const segment: TextSegment = { text };
    const color = normalizeColor(getPresentationAttr(tspan, 'fill'));
    if (color) {
      const { hex } = colorToOpacity(color);
      segment.color = hex;
    }

    const fontSize = getPresentationAttr(tspan, 'font-size');
    if (fontSize) segment.fontSize = parseFloat(fontSize);

    const fontFamily = getPresentationAttr(tspan, 'font-family');
    if (fontFamily) segment.fontFamily = fontFamily.replace(/["']/g, '');

    const fontWeightValue = getPresentationAttr(tspan, 'font-weight');
    if (fontWeightValue === 'bold') segment.fontWeight = 700;
    else if (fontWeightValue && fontWeightValue !== 'normal') {
      const parsedWeight = parseInt(fontWeightValue, 10);
      if (!isNaN(parsedWeight)) segment.fontWeight = parsedWeight;
    }

    const fontStyleValue = getPresentationAttr(tspan, 'font-style');
    if (fontStyleValue === 'italic') segment.fontStyle = 'italic';

    const textDecorationValue = getPresentationAttr(tspan, 'text-decoration');
    if (textDecorationValue === 'underline') segment.textDecoration = 'underline';
    else if (textDecorationValue === 'line-through') segment.textDecoration = 'strikethrough';

    const letterSpacing = getPresentationAttr(tspan, 'letter-spacing');
    if (letterSpacing) segment.letterSpacing = parseFloat(letterSpacing);

    segments.push(segment);
  }

  return { content, segments };
}

function maybeWrapWithClip(node: InterchangeNode, el: Element, ctx: ParseCtx): InterchangeNode {
  const clipRef = resolveUrlRef(getPresentationAttr(el, 'clip-path'));
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
    getPresentationAttr(el, 'fill-rule') === 'evenodd'
      ? ('evenodd' as const)
      : ('nonzero' as const);

  const opacity = getPresentationAttr(el, 'opacity');
  const blendMode = parseBlendMode(el);

  let resolvedFills = fills;
  if (fills.length === 0 && fillGradients.length === 0) {
    const fillAttr = getPresentationAttr(el, 'fill');
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
  if (strokes.length === 0 && getPresentationAttr(el, 'stroke') === null && ctx.inheritedStroke) {
    const color = normalizeColor(ctx.inheritedStroke) ?? '#000000';
    const { hex, opacity: co } = colorToOpacity(color);
    const sw = ctx.inheritedStrokeWidth ?? 1;
    const capStr = getPresentationAttr(el, 'stroke-linecap') ?? ctx.inheritedStrokeCap;
    const joinStr = getPresentationAttr(el, 'stroke-linejoin') ?? ctx.inheritedStrokeJoin;
    resolvedStrokes = [
      {
        color: hex,
        width: sw,
        opacity: co,
        visible: true,
        cap: (['butt', 'round', 'square'].includes(capStr ?? '')
          ? capStr
          : 'butt') as InterchangeStrokeCap,
        join: (['miter', 'round', 'bevel'].includes(joinStr ?? '')
          ? joinStr
          : 'miter') as InterchangeStrokeJoin,
        align: 'center',
        dashPattern: 'solid' as InterchangeDashPattern,
        dashOffset: 0,
        miterLimit: 4,
      },
    ];
  }

  const isRectLike =
    tagName === 'rect' && (isIdentityMatrix(worldMatrix) || isRectilinearTransform(worldMatrix));
  const isEllipseLike =
    (tagName === 'circle' || tagName === 'ellipse') &&
    (isIdentityMatrix(worldMatrix) || isRectilinearTransform(worldMatrix));

  let node: InterchangeNode;

  if (isRectLike) {
    const rx = parseAttr(el, 'rx');
    const rectX = parseAttr(el, 'x');
    const rectY = parseAttr(el, 'y');
    const rectWidth = parseAttr(el, 'width', bounds.width || 1);
    const rectHeight = parseAttr(el, 'height', bounds.height || 1);
    const transform = isIdentityMatrix(worldMatrix)
      ? { x: rectX, y: rectY, width: rectWidth, height: rectHeight, rotation: 0 }
      : createTransformedShapeBounds(rectX, rectY, rectWidth, rectHeight, worldMatrix);
    node = createInterchangeNode('rectangle', {
      name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
      cornerRadius: rx,
      fills: resolvedFills,
      gradients: allGradients,
      strokes: resolvedStrokes,
      svgPathData: localD,
      opacity: opacity ? parseFloat(opacity) : 1,
      blendMode,
    });
  } else if (isEllipseLike) {
    const ellipseX = bounds.x;
    const ellipseY = bounds.y;
    const ellipseWidth = bounds.width || 1;
    const ellipseHeight = bounds.height || 1;
    const transform = isIdentityMatrix(worldMatrix)
      ? { x: ellipseX, y: ellipseY, width: ellipseWidth, height: ellipseHeight, rotation: 0 }
      : createTransformedShapeBounds(ellipseX, ellipseY, ellipseWidth, ellipseHeight, worldMatrix);
    node = createInterchangeNode('ellipse', {
      name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
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

  const x = parseAttr(el, 'x');
  const y = parseAttr(el, 'y');

  const fillAttr = getPresentationAttr(el, 'fill');
  const color = normalizeColor(fillAttr) ?? '#000000';
  const { hex, opacity } = colorToOpacity(color);

  const fontSize = parseAttr(el, 'font-size', 16);
  const fontFamily = (getPresentationAttr(el, 'font-family') ?? 'Inter').replace(/["']/g, '');

  const fontWeightStr = getPresentationAttr(el, 'font-weight');
  let fontWeight = 400;
  if (fontWeightStr === 'bold') fontWeight = 700;
  else if (fontWeightStr && fontWeightStr !== 'normal') {
    const parsed = parseInt(fontWeightStr, 10);
    if (!isNaN(parsed)) fontWeight = parsed;
  }

  const fontStyle: 'normal' | 'italic' =
    getPresentationAttr(el, 'font-style') === 'italic' ? 'italic' : 'normal';

  const textAnchor = getPresentationAttr(el, 'text-anchor');
  let textAlign: 'left' | 'center' | 'right' = 'left';
  if (textAnchor === 'middle') textAlign = 'center';
  else if (textAnchor === 'end') textAlign = 'right';

  const { content, segments } = extractTextSegments(el);
  const textLines = content.split('\n');
  const estimatedWidth = Math.max(
    1,
    ...textLines.map((line) => Math.max(fontSize * 0.5, line.length * fontSize * 0.6)),
  );
  const estimatedHeight = Math.max(fontSize * 1.5, textLines.length * fontSize * 1.5);
  const blendMode = parseBlendMode(el);
  const letterSpacing = parseAttr(el, 'letter-spacing', 0);

  const textDecorationStr = getPresentationAttr(el, 'text-decoration');
  let textDecoration: 'none' | 'underline' | 'strikethrough' = 'none';
  if (textDecorationStr === 'underline') textDecoration = 'underline';
  else if (textDecorationStr === 'line-through') textDecoration = 'strikethrough';

  const transform = isIdentityMatrix(worldMatrix)
    ? { x, y: y - fontSize, width: estimatedWidth, height: estimatedHeight, rotation: 0 }
    : createTransformedShapeBounds(x, y - fontSize, estimatedWidth, estimatedHeight, worldMatrix);
  const textAutoResize: TextAutoResize = textLines.length > 1 ? 'height' : 'width';

  return createInterchangeNode('text', {
    name: el.getAttribute('data-name') ?? el.getAttribute('id') ?? '',
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    content,
    segments,
    textAutoResize,
    fontSize,
    fontFamily,
    fontWeight,
    fontStyle,
    textAlign,
    letterSpacing,
    textDecoration,
    fills: [{ color: hex, opacity, visible: true }],
    opacity: getPresentationAttr(el, 'opacity')
      ? parseFloat(getPresentationAttr(el, 'opacity')!)
      : 1,
    blendMode,
  });
}

function parseImageElement(el: Element, ctx: ParseCtx): InterchangeNode {
  const elMatrix = parseTransformMatrix(el.getAttribute('transform'));
  const worldMatrix = elMatrix
    ? new DOMMatrix().multiplySelf(ctx.parentMatrix).multiplySelf(elMatrix)
    : ctx.parentMatrix;

  const rawX = parseAttr(el, 'x');
  const rawY = parseAttr(el, 'y');
  const width = parseAttr(el, 'width', 100);
  const height = parseAttr(el, 'height', 100);
  const transform = isIdentityMatrix(worldMatrix)
    ? { x: rawX, y: rawY, width, height, rotation: 0 }
    : createTransformedShapeBounds(rawX, rawY, width, height, worldMatrix);

  const href = resolveHref(el);

  const par = getPresentationAttr(el, 'preserveAspectRatio') ?? 'xMidYMid meet';
  let fit: 'fill' | 'fit' | 'crop' = 'fill';
  if (par === 'none') fit = 'fill';
  else if (par.includes('meet')) fit = 'fit';
  else if (par.includes('slice')) fit = 'crop';

  return createInterchangeNode('image', {
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
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

export function parseElement(el: Element, ctx: ParseCtx): InterchangeNode | null {
  const tagName = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tagName)) return null;

  const display = getPresentationAttr(el, 'display');
  if (display === 'none') return null;
  const visibility = getPresentationAttr(el, 'visibility');
  if (visibility === 'hidden' || visibility === 'collapse') return null;

  if (tagName === 'use') {
    return parseUseElement(el, ctx);
  }

  const ownFill = getPresentationAttr(el, 'fill');
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

    const groupFill = getPresentationAttr(el, 'fill');
    const groupStroke = getPresentationAttr(el, 'stroke');
    const groupStrokeWidth = getPresentationAttr(el, 'stroke-width');
    const groupStrokeCap = getPresentationAttr(el, 'stroke-linecap');
    const groupStrokeJoin = getPresentationAttr(el, 'stroke-linejoin');

    const groupCtx: ParseCtx = {
      ...childCtx,
      parentMatrix: worldMatrix,
      inheritedFill: groupFill ?? ctx.inheritedFill,
      inheritedStroke: groupStroke ?? ctx.inheritedStroke,
      inheritedStrokeWidth: groupStrokeWidth
        ? parseFloat(groupStrokeWidth)
        : ctx.inheritedStrokeWidth,
      inheritedStrokeCap: groupStrokeCap ?? ctx.inheritedStrokeCap,
      inheritedStrokeJoin: groupStrokeJoin ?? ctx.inheritedStrokeJoin,
    };

    const children: InterchangeNode[] = [];
    for (const child of el.children) {
      const parsed = parseElement(child, groupCtx);
      if (parsed) children.push(parsed);
    }

    if (children.length === 0) return null;

    const opacity = parseFloat(getPresentationAttr(el, 'opacity') ?? '1');
    const groupOpacity = Number.isFinite(opacity) ? opacity : 1;
    const blendMode = parseBlendMode(el);
    const filterRef = resolveUrlRef(getPresentationAttr(el, 'filter'));
    const groupEffects = filterRef ? ctx.filters.get(filterRef) : undefined;
    const clipRef = resolveUrlRef(getPresentationAttr(el, 'clip-path'));
    const maskRef = resolveUrlRef(getPresentationAttr(el, 'mask'));
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
