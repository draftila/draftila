import type { InterchangeDocument, InterchangeNode } from '../interchange-format';
import {
  escapeXml,
  svgColor,
  resolveDashArraySvg,
  rectPath,
  type RenderContext,
} from './svg-gen-utils';
import { buildDropShadowFilter, buildInnerShadowFilter, buildGradientDef } from './svg-defs';
import { buildArrowheadSvg } from './svg-arrowheads';

function renderEmbeddedSvg(
  svgContent: string,
  x: number,
  y: number,
  width: number,
  height: number,
  preserveAspectRatio?: string,
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const errorNode = doc.querySelector('parsererror');
  const svgEl = doc.querySelector('svg');
  if (errorNode || !svgEl) {
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${escapeXml(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`)}" preserveAspectRatio="${preserveAspectRatio ?? 'xMidYMid meet'}"/>`;
  }

  svgEl.setAttribute('x', String(x));
  svgEl.setAttribute('y', String(y));
  svgEl.setAttribute('width', String(width));
  svgEl.setAttribute('height', String(height));
  svgEl.setAttribute('preserveAspectRatio', preserveAspectRatio ?? 'xMidYMid meet');

  const outerHtml = (svgEl as Element & { outerHTML?: string }).outerHTML;
  if (outerHtml) return outerHtml;

  return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${escapeXml(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`)}" preserveAspectRatio="${preserveAspectRatio ?? 'xMidYMid meet'}"/>`;
}

function buildShapeGeometry(
  node: InterchangeNode,
  ox: number,
  oy: number,
): { tag: string; attrs: string; selfClose: boolean } | null {
  const translateAttr = ox !== 0 || oy !== 0 ? ` transform="translate(${ox},${oy})"` : '';

  if (node.svgPathData && node.type !== 'frame') {
    const fillRuleAttr = node.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
    return {
      tag: 'path',
      attrs: `d="${node.svgPathData}"${fillRuleAttr}${translateAttr}`,
      selfClose: true,
    };
  }

  switch (node.type) {
    case 'rectangle':
    case 'frame': {
      const hasIndependent =
        node.cornerRadiusTL !== undefined ||
        node.cornerRadiusTR !== undefined ||
        node.cornerRadiusBL !== undefined ||
        node.cornerRadiusBR !== undefined;

      if (hasIndependent) {
        const tl = node.cornerRadiusTL ?? node.cornerRadius ?? 0;
        const tr = node.cornerRadiusTR ?? node.cornerRadius ?? 0;
        const br = node.cornerRadiusBR ?? node.cornerRadius ?? 0;
        const bl = node.cornerRadiusBL ?? node.cornerRadius ?? 0;
        const d = rectPath(ox, oy, node.width, node.height, tl, tr, br, bl);
        return { tag: 'path', attrs: `d="${d}"`, selfClose: true };
      }

      const cr = node.cornerRadius ?? 0;
      return {
        tag: 'rect',
        attrs: `x="${ox}" y="${oy}" width="${node.width}" height="${node.height}"${cr ? ` rx="${cr}"` : ''}`,
        selfClose: true,
      };
    }

    case 'ellipse': {
      const cx = ox + node.width / 2;
      const cy = oy + node.height / 2;
      return {
        tag: 'ellipse',
        attrs: `cx="${cx}" cy="${cy}" rx="${node.width / 2}" ry="${node.height / 2}"`,
        selfClose: true,
      };
    }

    case 'polygon': {
      const sides = node.sides ?? 6;
      const cxP = ox + node.width / 2;
      const cyP = oy + node.height / 2;
      const rxP = node.width / 2;
      const ryP = node.height / 2;
      const pts: string[] = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        pts.push(`${cxP + rxP * Math.cos(angle)},${cyP + ryP * Math.sin(angle)}`);
      }
      return { tag: 'polygon', attrs: `points="${pts.join(' ')}"`, selfClose: true };
    }

    case 'star': {
      const numPoints = node.starPoints ?? 5;
      const innerR = node.innerRadius ?? 0.38;
      const cxS = ox + node.width / 2;
      const cyS = oy + node.height / 2;
      const rxS = node.width / 2;
      const ryS = node.height / 2;
      const pts: string[] = [];
      for (let i = 0; i < numPoints * 2; i++) {
        const angle = (i * Math.PI) / numPoints - Math.PI / 2;
        const isOuter = i % 2 === 0;
        const rx = isOuter ? rxS : rxS * innerR;
        const ry = isOuter ? ryS : ryS * innerR;
        pts.push(`${cxS + rx * Math.cos(angle)},${cyS + ry * Math.sin(angle)}`);
      }
      return { tag: 'polygon', attrs: `points="${pts.join(' ')}"`, selfClose: true };
    }

    case 'path': {
      if (node.svgPathData) {
        const fillRuleAttr = node.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
        return {
          tag: 'path',
          attrs: `d="${node.svgPathData}"${fillRuleAttr}${translateAttr}`,
          selfClose: true,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

function renderFillsAndStrokes(
  node: InterchangeNode,
  ox: number,
  oy: number,
  rctx: RenderContext,
  gradientIds: string[] = [],
): string {
  const geom = buildShapeGeometry(node, ox, oy);
  if (!geom) return '';

  const parts: string[] = [];
  const visibleFills = node.fills.filter((f) => f.visible);
  const visibleStrokes = node.strokes.filter((s) => s.visible && s.width > 0);

  if (gradientIds.length > 0) {
    parts.push(`<${geom.tag} ${geom.attrs} fill="url(#${gradientIds[0]})" stroke="none"/>`);
  } else if (visibleFills.length > 0) {
    for (const fill of visibleFills) {
      const color = svgColor(fill.color, fill.opacity);
      parts.push(`<${geom.tag} ${geom.attrs} fill="${color}" stroke="none"/>`);
    }
  } else if (visibleStrokes.length === 0) {
    parts.push(`<${geom.tag} ${geom.attrs} fill="none" stroke="none"/>`);
  }

  for (const stroke of visibleStrokes) {
    const color = svgColor(stroke.color, stroke.opacity);
    let strokeAttrs = `stroke="${color}" stroke-width="${stroke.width}"`;
    if (stroke.cap !== 'butt') strokeAttrs += ` stroke-linecap="${stroke.cap}"`;
    if (stroke.join !== 'miter') strokeAttrs += ` stroke-linejoin="${stroke.join}"`;
    const dash = resolveDashArraySvg(stroke);
    if (dash) strokeAttrs += ` stroke-dasharray="${dash}"`;
    if (stroke.dashOffset) strokeAttrs += ` stroke-dashoffset="${stroke.dashOffset}"`;

    if (stroke.align === 'inside') {
      const clipId = `${rctx.idPrefix}stroke-clip-${rctx.defCounter++}`;
      rctx.defs.push(`<clipPath id="${clipId}"><${geom.tag} ${geom.attrs}/></clipPath>`);
      const insideAttrs = strokeAttrs.replace(
        `stroke-width="${stroke.width}"`,
        `stroke-width="${stroke.width * 2}"`,
      );
      parts.push(
        `<${geom.tag} ${geom.attrs} fill="none" ${insideAttrs} clip-path="url(#${clipId})"/>`,
      );
    } else if (stroke.align === 'outside') {
      const maskId = `${rctx.idPrefix}stroke-mask-${rctx.defCounter++}`;
      rctx.defs.push(
        `<mask id="${maskId}"><rect x="-50%" y="-50%" width="200%" height="200%" fill="white"/><${geom.tag} ${geom.attrs} fill="black"/></mask>`,
      );
      const outsideAttrs = strokeAttrs.replace(
        `stroke-width="${stroke.width}"`,
        `stroke-width="${stroke.width * 2}"`,
      );
      parts.push(`<${geom.tag} ${geom.attrs} fill="none" ${outsideAttrs} mask="url(#${maskId})"/>`);
    } else {
      parts.push(`<${geom.tag} ${geom.attrs} fill="none" ${strokeAttrs}/>`);
    }
  }

  return parts.join('');
}

function nodeToSvg(
  node: InterchangeNode,
  offsetX: number,
  offsetY: number,
  rctx: RenderContext,
): string {
  if (!node.visible) return '';

  const ox = node.x - offsetX;
  const oy = node.y - offsetY;

  let dropFilterAttr = '';
  if (node.shadows.length > 0 || node.blurs.length > 0) {
    const filterId = `${rctx.idPrefix}filter-${rctx.defCounter++}`;
    const filterDef = buildDropShadowFilter(node.shadows, node.blurs, filterId);
    if (filterDef) {
      rctx.defs.push(filterDef);
      dropFilterAttr = `filter="url(#${filterId})"`;
    }
  }

  let innerShadowAttr = '';
  const innerShadows = node.shadows.filter((s) => s.type === 'inner' && s.visible);
  if (innerShadows.length > 0) {
    const filterId = `${rctx.idPrefix}inner-${rctx.defCounter++}`;
    const filterDef = buildInnerShadowFilter(node.shadows, filterId);
    if (filterDef) {
      rctx.defs.push(filterDef);
      innerShadowAttr = `filter="url(#${filterId})"`;
    }
  }

  const gradientIds: string[] = [];
  for (const grad of node.gradients) {
    const gradId = `${rctx.idPrefix}grad-${rctx.defCounter++}`;
    rctx.defs.push(buildGradientDef(grad, gradId));
    gradientIds.push(gradId);
  }

  let content = '';

  switch (node.type) {
    case 'rectangle':
    case 'ellipse':
    case 'polygon':
    case 'star':
    case 'path': {
      content = renderFillsAndStrokes(node, ox, oy, rctx, gradientIds);
      if (innerShadowAttr) {
        content = `<g ${innerShadowAttr}>${content}</g>`;
      }
      if (node.name) {
        content = content.replace(/^<(\w+) /, `<$1 data-name="${escapeXml(node.name)}" `);
      }
      break;
    }

    case 'frame': {
      const visibleFrameFills = node.fills.filter((f) => f.visible);
      const visibleFrameStrokes = node.strokes.filter((s) => s.visible && s.width > 0);
      const hasVisibleFillsOrStrokes =
        visibleFrameFills.length > 0 || visibleFrameStrokes.length > 0 || gradientIds.length > 0;
      const frameFillsStrokes = hasVisibleFillsOrStrokes
        ? renderFillsAndStrokes(node, ox, oy, rctx, gradientIds)
        : '';
      const childrenSvg = node.children
        .map((child) => nodeToSvg(child, offsetX, offsetY, rctx))
        .join('');

      const clipId = node.clip ? `${rctx.idPrefix}clip-${rctx.defCounter++}` : null;
      if (clipId) {
        const geom = buildShapeGeometry(node, ox, oy);
        if (geom) {
          rctx.defs.push(`<clipPath id="${clipId}"><${geom.tag} ${geom.attrs}/></clipPath>`);
        }
      }

      content = frameFillsStrokes;
      if (childrenSvg) {
        if (clipId) {
          content += `<g clip-path="url(#${clipId})">${childrenSvg}</g>`;
        } else {
          content += childrenSvg;
        }
      }
      break;
    }

    case 'text': {
      const fontSize = node.fontSize ?? 16;
      const fontFamily = node.fontFamily ?? 'Inter';
      const fontWeight = node.fontWeight ?? 400;
      const fontStyle = node.fontStyle === 'italic' ? ' font-style="italic"' : '';

      let textAnchor = '';
      let textX = ox;
      if (node.textAlign === 'center') {
        textAnchor = ' text-anchor="middle"';
        textX = ox + node.width / 2;
      } else if (node.textAlign === 'right') {
        textAnchor = ' text-anchor="end"';
        textX = ox + node.width;
      }

      let decoration = '';
      if (node.textDecoration === 'underline') decoration = ' text-decoration="underline"';
      else if (node.textDecoration === 'strikethrough')
        decoration = ' text-decoration="line-through"';

      const letterSpacing = node.letterSpacing ? ` letter-spacing="${node.letterSpacing}"` : '';

      let textContent = node.content ?? '';
      if (node.textTransform === 'uppercase') textContent = textContent.toUpperCase();
      else if (node.textTransform === 'lowercase') textContent = textContent.toLowerCase();

      const visibleFill = node.fills.find((f) => f.visible);
      const fillAttr = visibleFill
        ? ` fill="${svgColor(visibleFill.color, visibleFill.opacity)}"`
        : ' fill="#000000"';

      const textNameAttr = node.name ? ` data-name="${escapeXml(node.name)}"` : '';
      content = `<text${textNameAttr} x="${textX}" y="${oy + fontSize}" font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" font-weight="${fontWeight}"${fontStyle}${textAnchor}${decoration}${letterSpacing}${fillAttr}>${escapeXml(textContent)}</text>`;
      break;
    }

    case 'line': {
      const lx1 = (node.x1 ?? node.x) - offsetX;
      const ly1 = (node.y1 ?? node.y) - offsetY;
      const lx2 = (node.x2 ?? node.x + node.width) - offsetX;
      const ly2 = (node.y2 ?? node.y) - offsetY;
      const visibleStroke = node.strokes.find((s) => s.visible && s.width > 0);
      const strokeColor = visibleStroke
        ? svgColor(visibleStroke.color, visibleStroke.opacity)
        : '#000000';
      const sw = visibleStroke?.width ?? 2;
      const lineCap = visibleStroke?.cap ?? 'butt';
      const capAttr = lineCap !== 'butt' ? ` stroke-linecap="${lineCap}"` : '';
      const strokeAttrs = `stroke="${strokeColor}" stroke-width="${sw}"${capAttr}`;
      content = `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" ${strokeAttrs}/>`;
      const endType = node.endArrowhead ?? 'none';
      const startType = node.startArrowhead ?? 'none';
      if (endType !== 'none') {
        content += buildArrowheadSvg(lx2, ly2, lx1, ly1, sw, strokeColor, endType, lineCap);
      }
      if (startType !== 'none') {
        content += buildArrowheadSvg(lx1, ly1, lx2, ly2, sw, strokeColor, startType, lineCap);
      }
      break;
    }

    case 'image': {
      if (node.src) {
        const preserveAspectRatio =
          node.fit === 'fit' ? 'xMidYMid meet' : node.fit === 'crop' ? 'xMidYMid slice' : 'none';
        content = `<image x="${ox}" y="${oy}" width="${node.width}" height="${node.height}" href="${escapeXml(node.src)}" preserveAspectRatio="${preserveAspectRatio}"/>`;
      } else {
        content = `<rect x="${ox}" y="${oy}" width="${node.width}" height="${node.height}" fill="#E0E0E0" stroke="#BDBDBD" stroke-width="1"/>`;
      }
      break;
    }

    case 'group': {
      const childrenSvg = node.children
        .map((child) => nodeToSvg(child, offsetX, offsetY, rctx))
        .join('');
      content = childrenSvg;
      break;
    }
    case 'svg': {
      if (!node.svgContent) break;
      content = renderEmbeddedSvg(
        node.svgContent,
        ox,
        oy,
        node.width,
        node.height,
        node.preserveAspectRatio,
      );
      break;
    }
  }

  const hasBlendMode = node.blendMode && node.blendMode !== 'normal';
  const needsGroup = node.opacity < 1 || node.rotation !== 0 || dropFilterAttr || hasBlendMode;
  if (!needsGroup) return content;

  let gAttrs = '';
  if (node.opacity < 1) gAttrs += ` opacity="${node.opacity}"`;
  if (dropFilterAttr) gAttrs += ` ${dropFilterAttr}`;
  if (hasBlendMode) gAttrs += ` style="mix-blend-mode:${node.blendMode}"`;
  if (node.rotation !== 0) {
    const cx = ox + node.width / 2;
    const cy = oy + node.height / 2;
    gAttrs += ` transform="rotate(${(node.rotation * 180) / Math.PI},${cx},${cy})"`;
  }

  return `<g${gAttrs}>${content}</g>`;
}

export function generateSvg(doc: InterchangeDocument, idPrefix = ''): string {
  if (doc.nodes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function computeBounds(nodes: InterchangeNode[]): void {
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
  }

  computeBounds(doc.nodes);

  const width = maxX - minX;
  const height = maxY - minY;

  const rctx: RenderContext = { defs: [], defCounter: 0, idPrefix };
  const elements: string[] = [];

  for (const node of doc.nodes) {
    elements.push(nodeToSvg(node, minX, minY, rctx));
  }

  const defsBlock = rctx.defs.length > 0 ? `<defs>${rctx.defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defsBlock}${elements.join('')}</svg>`;
}
