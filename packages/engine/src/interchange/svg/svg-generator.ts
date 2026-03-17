import type {
  InterchangeDocument,
  InterchangeNode,
  InterchangeFill,
  InterchangeStroke,
  InterchangeShadow,
  InterchangeBlur,
  InterchangeGradient,
  InterchangeDashPattern,
} from '../interchange-format';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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

function svgColor(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  if (opacity <= 0) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function resolveDashArraySvg(stroke: InterchangeStroke): string {
  if (stroke.dashArray && stroke.dashArray.length > 0) {
    return stroke.dashArray.join(',');
  }
  return dashPatternToSvg(stroke.dashPattern, stroke.width);
}

function dashPatternToSvg(pattern: InterchangeDashPattern, strokeWidth: number): string {
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

function parseHexAlpha(color: string): { r: number; g: number; b: number; a: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (color.length >= 7) {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  }
  if (color.length > 7) {
    a = parseInt(color.slice(7, 9), 16) / 255;
  }
  return { r, g, b, a };
}

function buildDropShadowFilter(
  shadows: InterchangeShadow[],
  blurs: InterchangeBlur[],
  filterId: string,
): string | null {
  const dropShadows = shadows.filter((s) => s.type === 'drop' && s.visible);
  const layerBlur = blurs.find((b) => b.type === 'layer' && b.visible);

  if (dropShadows.length === 0 && !layerBlur) return null;

  const parts: string[] = [
    `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">`,
  ];

  if (layerBlur && layerBlur.radius > 0) {
    parts.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${layerBlur.radius}"/>`);
  }

  for (const shadow of dropShadows) {
    const { r, g, b, a } = parseHexAlpha(shadow.color);
    parts.push(
      `<feDropShadow dx="${shadow.x}" dy="${shadow.y}" stdDeviation="${shadow.blur / 2}" flood-color="rgb(${r},${g},${b})" flood-opacity="${a}"/>`,
    );
  }

  parts.push('</filter>');
  return parts.join('');
}

function buildInnerShadowFilter(shadows: InterchangeShadow[], filterId: string): string | null {
  const innerShadows = shadows.filter((s) => s.type === 'inner' && s.visible);
  if (innerShadows.length === 0) return null;

  const parts: string[] = [
    `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">`,
    '<feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>',
  ];

  for (const shadow of innerShadows) {
    const { r, g, b, a } = parseHexAlpha(shadow.color);
    parts.push(
      `<feGaussianBlur stdDeviation="${shadow.blur / 2}"/>`,
      `<feOffset dx="${shadow.x}" dy="${shadow.y}" result="offsetblur"/>`,
      `<feFlood flood-color="rgb(${r},${g},${b})" flood-opacity="${a}" result="color"/>`,
      '<feComposite in2="offsetblur" operator="in"/>',
      '<feComposite in2="SourceAlpha" operator="in"/>',
    );
  }

  parts.push('<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge>', '</filter>');
  return parts.join('');
}

function buildGradientDef(gradient: InterchangeGradient, gradId: string): string {
  if (gradient.type === 'linear') {
    const angleRad = ((gradient.angle ?? 0) * Math.PI) / 180;
    const x1 = 0.5 - Math.cos(angleRad) * 0.5;
    const y1 = 0.5 - Math.sin(angleRad) * 0.5;
    const x2 = 0.5 + Math.cos(angleRad) * 0.5;
    const y2 = 0.5 + Math.sin(angleRad) * 0.5;

    const stops = gradient.stops
      .map((s) => `<stop offset="${s.position}" stop-color="${s.color}"/>`)
      .join('');
    return `<linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
  }

  const stops = gradient.stops
    .map((s) => `<stop offset="${s.position}" stop-color="${s.color}"/>`)
    .join('');
  return `<radialGradient id="${gradId}" cx="${gradient.cx ?? 0.5}" cy="${gradient.cy ?? 0.5}" r="${gradient.r ?? 0.5}">${stops}</radialGradient>`;
}

interface RenderContext {
  defs: string[];
  defCounter: number;
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
      const clipId = `stroke-clip-${rctx.defCounter++}`;
      rctx.defs.push(`<clipPath id="${clipId}"><${geom.tag} ${geom.attrs}/></clipPath>`);
      const insideAttrs = strokeAttrs.replace(
        `stroke-width="${stroke.width}"`,
        `stroke-width="${stroke.width * 2}"`,
      );
      parts.push(
        `<${geom.tag} ${geom.attrs} fill="none" ${insideAttrs} clip-path="url(#${clipId})"/>`,
      );
    } else if (stroke.align === 'outside') {
      const maskId = `stroke-mask-${rctx.defCounter++}`;
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
  const ox = node.x - offsetX;
  const oy = node.y - offsetY;

  let dropFilterAttr = '';
  if (node.shadows.length > 0 || node.blurs.length > 0) {
    const filterId = `filter-${rctx.defCounter++}`;
    const filterDef = buildDropShadowFilter(node.shadows, node.blurs, filterId);
    if (filterDef) {
      rctx.defs.push(filterDef);
      dropFilterAttr = `filter="url(#${filterId})"`;
    }
  }

  let innerShadowAttr = '';
  const innerShadows = node.shadows.filter((s) => s.type === 'inner' && s.visible);
  if (innerShadows.length > 0) {
    const filterId = `inner-${rctx.defCounter++}`;
    const filterDef = buildInnerShadowFilter(node.shadows, filterId);
    if (filterDef) {
      rctx.defs.push(filterDef);
      innerShadowAttr = `filter="url(#${filterId})"`;
    }
  }

  const gradientIds: string[] = [];
  for (const grad of node.gradients) {
    const gradId = `grad-${rctx.defCounter++}`;
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

      const clipId = node.clip ? `clip-${rctx.defCounter++}` : null;
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
      content = `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"/>`;
      break;
    }

    case 'arrow': {
      const ax1 = (node.x1 ?? node.x) - offsetX;
      const ay1 = (node.y1 ?? node.y) - offsetY;
      const ax2 = (node.x2 ?? node.x + node.width) - offsetX;
      const ay2 = (node.y2 ?? node.y) - offsetY;
      const visibleStroke = node.strokes.find((s) => s.visible && s.width > 0);
      const strokeColor = visibleStroke
        ? svgColor(visibleStroke.color, visibleStroke.opacity)
        : '#000000';
      const sw = visibleStroke?.width ?? 2;
      const strokeAttrs = `stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"`;
      content = `<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" ${strokeAttrs}/>`;
      if (node.endArrowhead) {
        content += buildArrowheadSvg(ax2, ay2, ax1, ay1, sw, strokeAttrs);
      }
      if (node.startArrowhead) {
        content += buildArrowheadSvg(ax1, ay1, ax2, ay2, sw, strokeAttrs);
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

function buildArrowheadSvg(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  sw: number,
  strokeAttrs: string,
): string {
  const headLen = Math.max(10, sw * 4);
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const spreadAngle = Math.PI / 6;

  const lx = tipX - headLen * Math.cos(angle - spreadAngle);
  const ly = tipY - headLen * Math.sin(angle - spreadAngle);
  const rx = tipX - headLen * Math.cos(angle + spreadAngle);
  const ry = tipY - headLen * Math.sin(angle + spreadAngle);

  return `<polyline points="${lx},${ly} ${tipX},${tipY} ${rx},${ry}" fill="none" ${strokeAttrs} stroke-linejoin="round"/>`;
}

export function generateSvg(doc: InterchangeDocument): string {
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

  const rctx: RenderContext = { defs: [], defCounter: 0 };
  const elements: string[] = [];

  for (const node of doc.nodes) {
    elements.push(nodeToSvg(node, minX, minY, rctx));
  }

  const defsBlock = rctx.defs.length > 0 ? `<defs>${rctx.defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defsBlock}${elements.join('')}</svg>`;
}
