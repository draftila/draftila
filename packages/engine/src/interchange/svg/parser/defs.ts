import type {
  InterchangeNode,
  InterchangeGradient,
  InterchangeGradientStop,
  InterchangeClipPath,
  InterchangeShadow,
  InterchangeBlur,
} from '../../interchange-format';
import { createInterchangeNode } from '../../interchange-format';
import { normalizeColor, colorToOpacity } from '../color';
import { parseTransformMatrix } from './transforms';
import { elementToPathData, getPathBBox, transformPathWithMatrix } from './path-utils';
import { parseAttr, resolveHref } from './shared';

export function resolveGradients(doc: Document): Map<string, InterchangeGradient> {
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

export function resolvePatterns(doc: Document): Map<string, string> {
  const patterns = new Map<string, string>();
  const patternEls = doc.querySelectorAll('pattern');

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

export function resolveClipPaths(doc: Document): Map<string, InterchangeClipPath> {
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

export function resolveMasks(doc: Document): Map<string, InterchangeClipPath> {
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

export function resolveSymbols(doc: Document): Map<string, Element> {
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

export function resolveFilters(
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

export function applyEffectsToNode(
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

export function wrapChildrenInClipFrame(
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
