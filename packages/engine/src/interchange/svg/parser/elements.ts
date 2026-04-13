import type {
  InterchangeNode,
  InterchangeStrokeCap,
  InterchangeStrokeJoin,
  InterchangeDashPattern,
} from '../../interchange-format';
import { createInterchangeNode } from '../../interchange-format';
import { normalizeColor, colorToOpacity } from '../color';
import { ParseCtx } from './types';
import { parseAttr, parseBlendMode, resolveHref, resolveUrlRef } from './shared';
import { buildFills, buildStrokes } from './paint';
import { elementToPathData, normalizePathData, transformPathWithMatrix } from './path-utils';
import { isIdentityMatrix, parseTransformMatrix } from './transforms';
import { applyEffectsToNode, wrapChildrenInClipFrame } from './defs';

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

  const { strokes } = buildStrokes(el, ctx.gradients);
  const allGradients = [...fillGradients];

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
    const capStr = el.getAttribute('stroke-linecap') ?? ctx.inheritedStrokeCap;
    const joinStr = el.getAttribute('stroke-linejoin') ?? ctx.inheritedStrokeJoin;
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

export function parseElement(el: Element, ctx: ParseCtx): InterchangeNode | null {
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
    const groupStrokeCap = el.getAttribute('stroke-linecap');
    const groupStrokeJoin = el.getAttribute('stroke-linejoin');

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
