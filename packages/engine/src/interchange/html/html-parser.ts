import {
  createInterchangeNode,
  createInterchangeDocument,
  type InterchangeDocument,
  type InterchangeFill,
  type InterchangeGradient,
  type InterchangeNode,
  type InterchangeShadow,
  type InterchangeStroke,
  type InterchangeTextSegment,
} from '../interchange-format';
import { parseTailwindClasses, type TailwindStyle } from './tailwind-class-parser';
import { parseInlineStyle } from './inline-style-parser';

export interface HtmlParseResult {
  doc: InterchangeDocument;
  warnings: string[];
}

interface InheritedTextStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

interface ParseState {
  warnings: Map<string, number>;
}

const SKIP_TAGS = new Set([
  'script',
  'style',
  'head',
  'meta',
  'link',
  'title',
  'template',
  'noscript',
  'base',
]);

const INLINE_TAGS = new Set([
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'a',
  'br',
  'small',
  'sub',
  'sup',
  'code',
  'abbr',
  'mark',
]);

const TEXT_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'label',
  'blockquote',
  'figcaption',
  'dt',
  'dd',
  'pre',
]);

const PLACEHOLDER_TAGS = new Set(['video', 'iframe', 'canvas', 'embed', 'object', 'audio']);

const FORM_TAGS = new Set(['input', 'textarea', 'select', 'progress', 'meter']);

const HEADING_DEFAULTS: Record<string, { fontSize: number; fontWeight: number }> = {
  h1: { fontSize: 30, fontWeight: 700 },
  h2: { fontSize: 24, fontWeight: 700 },
  h3: { fontSize: 20, fontWeight: 600 },
  h4: { fontSize: 18, fontWeight: 600 },
  h5: { fontSize: 16, fontWeight: 600 },
  h6: { fontSize: 14, fontWeight: 600 },
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function addWarning(state: ParseState, message: string): void {
  state.warnings.set(message, (state.warnings.get(message) ?? 0) + 1);
}

function elementStyle(el: Element, state: ParseState): TailwindStyle {
  const parsed = parseTailwindClasses(el.getAttribute('class') ?? '');
  for (const warning of parsed.warnings) addWarning(state, warning);
  for (const token of parsed.unknown) addWarning(state, `unknown class "${token}" ignored`);
  const inline = parseInlineStyle(el.getAttribute('style'));
  return { ...parsed.style, ...inline };
}

function tagName(el: Element): string {
  return el.tagName.toLowerCase();
}

function isTextOnly(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) continue;
    if (child.nodeType !== ELEMENT_NODE) continue;
    const childEl = child as Element;
    if (!INLINE_TAGS.has(tagName(childEl))) return false;
    if (!isTextOnly(childEl)) return false;
  }
  return true;
}

function hasTextContent(el: Element): boolean {
  return (el.textContent ?? '').trim().length > 0;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function resolveLetterSpacing(style: TailwindStyle, fontSize: number): number | undefined {
  if (style.letterSpacing !== undefined) return style.letterSpacing;
  if (style.letterSpacingEm !== undefined) return style.letterSpacingEm * fontSize;
  return undefined;
}

function childTextContext(
  ctx: InheritedTextStyle,
  style: TailwindStyle,
  fontSize: number,
): InheritedTextStyle {
  const next: InheritedTextStyle = { ...ctx };
  if (style.textColor !== undefined) next.color = style.textColor;
  if (style.fontSize !== undefined) next.fontSize = style.fontSize;
  if (style.fontWeight !== undefined) next.fontWeight = style.fontWeight;
  if (style.fontFamily !== undefined) next.fontFamily = style.fontFamily;
  if (style.fontItalic !== undefined) next.fontStyle = style.fontItalic ? 'italic' : 'normal';
  if (style.textAlign !== undefined) next.textAlign = style.textAlign;
  if (style.lineHeight !== undefined) next.lineHeight = style.lineHeight;
  if (style.textTransform !== undefined) next.textTransform = style.textTransform;
  const letterSpacing = resolveLetterSpacing(style, fontSize);
  if (letterSpacing !== undefined) next.letterSpacing = letterSpacing;
  return next;
}

interface SegmentRun {
  text: string;
  overrides: Omit<InterchangeTextSegment, 'text'>;
}

const INLINE_TAG_OVERRIDES: Record<string, Omit<InterchangeTextSegment, 'text'>> = {
  strong: { fontWeight: 700 },
  b: { fontWeight: 700 },
  em: { fontStyle: 'italic' },
  i: { fontStyle: 'italic' },
  u: { textDecoration: 'underline' },
  s: { textDecoration: 'strikethrough' },
  del: { textDecoration: 'strikethrough' },
  code: { fontFamily: 'monospace' },
};

function segmentOverridesFromStyle(
  style: TailwindStyle,
  baseFontSize: number,
): Omit<InterchangeTextSegment, 'text'> {
  const overrides: Omit<InterchangeTextSegment, 'text'> = {};
  if (style.textColor !== undefined) overrides.color = style.textColor;
  if (style.fontSize !== undefined) overrides.fontSize = style.fontSize;
  if (style.fontWeight !== undefined) overrides.fontWeight = style.fontWeight;
  if (style.fontFamily !== undefined) overrides.fontFamily = style.fontFamily;
  if (style.fontItalic !== undefined) overrides.fontStyle = style.fontItalic ? 'italic' : 'normal';
  if (style.textDecoration !== undefined && style.textDecoration !== 'none') {
    overrides.textDecoration = style.textDecoration;
  }
  const letterSpacing = resolveLetterSpacing(style, style.fontSize ?? baseFontSize);
  if (letterSpacing !== undefined) overrides.letterSpacing = letterSpacing;
  return overrides;
}

function collectRuns(
  el: Element,
  overrides: Omit<InterchangeTextSegment, 'text'>,
  baseFontSize: number,
  runs: SegmentRun[],
  state: ParseState,
): void {
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const text = collapseWhitespace(child.textContent ?? '');
      if (text.length > 0) runs.push({ text, overrides });
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const childEl = child as Element;
    const tag = tagName(childEl);
    if (tag === 'br') {
      runs.push({ text: '\n', overrides });
      continue;
    }
    if (!INLINE_TAGS.has(tag)) continue;
    const style = elementStyle(childEl, state);
    const merged = {
      ...overrides,
      ...INLINE_TAG_OVERRIDES[tag],
      ...segmentOverridesFromStyle(style, baseFontSize),
    };
    collectRuns(childEl, merged, baseFontSize, runs, state);
  }
}

function fillsFromStyle(style: TailwindStyle): InterchangeFill[] {
  if (style.backgroundColor === undefined || style.backgroundColor === 'transparent') return [];
  return [
    {
      color: style.backgroundColor,
      opacity: style.backgroundOpacity ?? 1,
      visible: true,
    },
  ];
}

function gradientFromStyle(
  style: TailwindStyle,
  state: ParseState,
): InterchangeGradient | undefined {
  const gradient = style.gradient;
  if (!gradient) return undefined;
  if (!gradient.from || !gradient.to) {
    addWarning(state, 'gradient needs both from-* and to-* colors; ignored');
    return undefined;
  }
  const stops = [{ color: gradient.from, position: 0 }];
  if (gradient.via) stops.push({ color: gradient.via, position: 0.5 });
  stops.push({ color: gradient.to, position: 1 });
  return { type: 'linear', angle: gradient.angle, stops };
}

function strokesFromStyle(style: TailwindStyle, state: ParseState): InterchangeStroke[] {
  const widths = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ];
  const hasPerSide = widths.some((width) => width !== undefined);
  const width = style.borderWidth ?? widths.find((value) => value !== undefined);
  if (width === undefined || width === 0) return [];

  if (hasPerSide && style.borderWidth === undefined) {
    const definedWidths = widths.filter((value): value is number => value !== undefined);
    if (new Set(definedWidths).size > 1) {
      addWarning(state, 'mixed per-side border widths approximated with a single width');
    }
  }

  return [
    {
      color: style.borderColor ?? '#e5e7eb',
      width,
      opacity: 1,
      visible: true,
      cap: 'butt',
      join: 'miter',
      align: 'inside',
      dashPattern:
        style.borderDash === 'dot' ? 'dot' : style.borderDash === 'dash' ? 'dash' : 'solid',
      dashOffset: 0,
      miterLimit: 4,
    },
  ];
}

function shadowsFromStyle(style: TailwindStyle): InterchangeShadow[] {
  return (style.shadows ?? []).map((shadow) => ({ ...shadow, visible: true }));
}

function applyVisualStyle(node: InterchangeNode, style: TailwindStyle, state: ParseState): void {
  node.fills = fillsFromStyle(style);
  const gradient = gradientFromStyle(style, state);
  if (gradient) {
    node.gradients = [gradient];
    if (node.fills.length === 0) {
      node.fills = [{ color: gradient.stops[0]!.color, opacity: 1, visible: true }];
    }
  }
  node.strokes = strokesFromStyle(style, state);
  node.shadows = shadowsFromStyle(style);
  if (style.blurRadius !== undefined) {
    node.blurs.push({ type: 'layer', radius: style.blurRadius, visible: true });
  }
  if (style.backdropBlurRadius !== undefined) {
    node.blurs.push({ type: 'background', radius: style.backdropBlurRadius, visible: true });
  }
  if (style.cornerRadius !== undefined) node.cornerRadius = style.cornerRadius;
  if (style.cornerRadiusTL !== undefined) node.cornerRadiusTL = style.cornerRadiusTL;
  if (style.cornerRadiusTR !== undefined) node.cornerRadiusTR = style.cornerRadiusTR;
  if (style.cornerRadiusBR !== undefined) node.cornerRadiusBR = style.cornerRadiusBR;
  if (style.cornerRadiusBL !== undefined) node.cornerRadiusBL = style.cornerRadiusBL;
  if (style.roundedFull) node.cornerRadius = 9999;
  if (style.opacity !== undefined) node.opacity = style.opacity;
  if (style.hidden) node.visible = false;
}

function applySizing(
  node: InterchangeNode,
  style: TailwindStyle,
  parentDirection: 'row' | 'col' | null,
): void {
  if (style.width !== undefined) {
    node.width = style.width;
    node.layoutSizingHorizontal = 'fixed';
  } else if (style.widthFull) {
    node.layoutSizingHorizontal = parentDirection ? 'fill' : 'hug';
  } else if (style.widthAuto) {
    node.layoutSizingHorizontal = 'hug';
  }

  if (style.height !== undefined) {
    node.height = style.height;
    node.layoutSizingVertical = 'fixed';
  } else if (style.heightFull) {
    node.layoutSizingVertical = parentDirection ? 'fill' : 'hug';
  } else if (style.heightAuto) {
    node.layoutSizingVertical = 'hug';
  }

  if (style.flexGrow && parentDirection) {
    if (parentDirection === 'row') node.layoutSizingHorizontal = 'fill';
    else node.layoutSizingVertical = 'fill';
  }
  if (style.selfStretch && parentDirection) {
    if (parentDirection === 'row') node.layoutSizingVertical = 'fill';
    else node.layoutSizingHorizontal = 'fill';
  }

  if (style.minWidth !== undefined) node.minWidth = style.minWidth;
  if (style.maxWidth !== undefined) node.maxWidth = style.maxWidth;
  if (style.minHeight !== undefined) node.minHeight = style.minHeight;
  if (style.maxHeight !== undefined) node.maxHeight = style.maxHeight;
}

function applyAbsolutePosition(node: InterchangeNode, style: TailwindStyle): void {
  if (style.position !== 'absolute') return;
  node.x = style.left ?? 0;
  node.y = style.top ?? 0;
}

function buildTextNode(
  el: Element,
  style: TailwindStyle,
  ctx: InheritedTextStyle,
  parentDirection: 'row' | 'col' | null,
  state: ParseState,
): InterchangeNode | null {
  const tag = tagName(el);
  const heading = HEADING_DEFAULTS[tag];
  const fontSize = style.fontSize ?? heading?.fontSize ?? ctx.fontSize ?? 16;
  const fontWeight = style.fontWeight ?? heading?.fontWeight ?? ctx.fontWeight ?? 400;
  const lineHeight = style.lineHeight ?? ctx.lineHeight ?? 1.2;

  const runs: SegmentRun[] = [];
  collectRuns(el, {}, fontSize, runs, state);
  const content = runs
    .map((run) => run.text)
    .join('')
    .trim();
  if (content.length === 0) return null;

  const node = createInterchangeNode('text', {
    name: content.slice(0, 30),
    width: 200,
    height: Math.ceil(fontSize * lineHeight),
    content,
    fontSize,
    fontWeight,
    fontFamily: style.fontFamily ?? ctx.fontFamily ?? 'Inter',
    fontStyle:
      style.fontItalic !== undefined
        ? style.fontItalic
          ? 'italic'
          : 'normal'
        : (ctx.fontStyle ?? 'normal'),
    textAlign: style.textAlign ?? ctx.textAlign ?? 'left',
    lineHeight,
    letterSpacing: resolveLetterSpacing(style, fontSize) ?? ctx.letterSpacing ?? 0,
    textDecoration: style.textDecoration ?? 'none',
    textTransform: style.textTransform ?? ctx.textTransform ?? 'none',
    fills: [
      {
        color: style.textColor ?? ctx.color ?? '#000000',
        opacity: style.textOpacity ?? 1,
        visible: true,
      },
    ],
  });

  if (runs.some((run) => Object.keys(run.overrides).length > 0)) {
    node.segments = runs
      .filter((run) => run.text.length > 0)
      .map((run) => ({ text: run.text, ...run.overrides }));
  }

  node.shadows = shadowsFromStyle(style);
  if (style.truncate) node.width = style.width ?? style.maxWidth ?? 200;

  applySizing(node, style, parentDirection);
  applyAbsolutePosition(node, style);

  if (node.layoutSizingHorizontal === 'fixed' || node.layoutSizingHorizontal === 'fill') {
    node.textAutoResize = 'height';
  } else if (style.maxWidth !== undefined) {
    node.width = style.maxWidth;
    node.textAutoResize = 'height';
  } else {
    node.textAutoResize = 'width';
  }
  if (style.hidden) node.visible = false;
  return node;
}

function needsWrapperFrame(style: TailwindStyle): boolean {
  return (
    style.backgroundColor !== undefined ||
    style.gradient !== undefined ||
    style.borderWidth !== undefined ||
    style.borderTopWidth !== undefined ||
    style.borderRightWidth !== undefined ||
    style.borderBottomWidth !== undefined ||
    style.borderLeftWidth !== undefined ||
    style.cornerRadius !== undefined ||
    style.roundedFull === true ||
    (style.shadows !== undefined && style.shadows.length > 0) ||
    style.paddingTop !== undefined ||
    style.paddingRight !== undefined ||
    style.paddingBottom !== undefined ||
    style.paddingLeft !== undefined
  );
}

function applyLayout(node: InterchangeNode, style: TailwindStyle, direction: 'row' | 'col'): void {
  node.layoutMode = direction === 'row' ? 'horizontal' : 'vertical';
  if (style.flexWrap) node.layoutWrap = 'wrap';

  const mainGap = style.gap ?? (direction === 'row' ? style.gapX : style.gapY);
  const crossGap = direction === 'row' ? style.gapY : style.gapX;
  node.layoutGap = mainGap ?? 0;
  if (crossGap !== undefined) node.layoutGapColumn = crossGap;

  node.paddingTop = style.paddingTop ?? 0;
  node.paddingRight = style.paddingRight ?? 0;
  node.paddingBottom = style.paddingBottom ?? 0;
  node.paddingLeft = style.paddingLeft ?? 0;
  node.layoutAlign = style.alignItems ?? 'start';
  node.layoutJustify = style.justifyContent ?? 'start';
}

function applyCssStretchDefaults(children: InterchangeNode[], direction: 'row' | 'col'): void {
  for (const child of children) {
    if (!child.visible) continue;
    if (direction === 'col') {
      if (child.layoutSizingHorizontal !== undefined) continue;
      if (child.type === 'text') {
        child.layoutSizingHorizontal = 'fill';
        child.textAutoResize = 'height';
      } else if (child.type === 'frame' || child.type === 'rectangle') {
        child.layoutSizingHorizontal = 'fill';
      }
    } else if (child.type === 'frame' && child.layoutSizingVertical === undefined) {
      child.layoutSizingVertical = 'fill';
    }
  }
}

function buildImageNode(
  el: Element,
  style: TailwindStyle,
  parentDirection: 'row' | 'col' | null,
): InterchangeNode {
  const attrWidth = Number(el.getAttribute('width'));
  const attrHeight = Number(el.getAttribute('height'));
  const node = createInterchangeNode('image', {
    name: el.getAttribute('alt') || 'image',
    width: style.width ?? (Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : 100),
    height: style.height ?? (Number.isFinite(attrHeight) && attrHeight > 0 ? attrHeight : 100),
    src: el.getAttribute('src') ?? '',
    fit: style.objectFit ?? 'crop',
  });
  if (style.cornerRadius !== undefined) node.cornerRadius = style.cornerRadius;
  if (style.roundedFull) node.cornerRadius = 9999;
  node.shadows = shadowsFromStyle(style);
  applySizing(node, style, parentDirection);
  applyAbsolutePosition(node, style);
  if (style.hidden) node.visible = false;
  return node;
}

function buildSvgNode(
  el: Element,
  style: TailwindStyle,
  parentDirection: 'row' | 'col' | null,
): InterchangeNode {
  let width = style.width;
  let height = style.height;
  const attrWidth = Number(el.getAttribute('width'));
  const attrHeight = Number(el.getAttribute('height'));
  if (width === undefined && Number.isFinite(attrWidth) && attrWidth > 0) width = attrWidth;
  if (height === undefined && Number.isFinite(attrHeight) && attrHeight > 0) height = attrHeight;
  const viewBox = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (width === undefined && viewBox.length === 4 && viewBox[2]! > 0) width = viewBox[2];
  if (height === undefined && viewBox.length === 4 && viewBox[3]! > 0) height = viewBox[3];

  const node = createInterchangeNode('svg', {
    name: 'svg',
    width: width ?? 24,
    height: height ?? 24,
    svgContent: el.outerHTML,
  });
  applySizing(node, style, parentDirection);
  applyAbsolutePosition(node, style);
  if (style.hidden) node.visible = false;
  return node;
}

function buildRectangleNode(
  name: string,
  style: TailwindStyle,
  parentDirection: 'row' | 'col' | null,
  state: ParseState,
): InterchangeNode {
  const node = createInterchangeNode('rectangle', {
    name,
    width: style.width ?? 100,
    height: style.height ?? 100,
  });
  applyVisualStyle(node, style, state);
  applySizing(node, style, parentDirection);
  applyAbsolutePosition(node, style);
  return node;
}

function buildContainerNode(
  el: Element,
  style: TailwindStyle,
  ctx: InheritedTextStyle,
  parentDirection: 'row' | 'col' | null,
  state: ParseState,
): InterchangeNode {
  const tag = tagName(el);
  const isFlex = style.display === 'flex';
  const isButtonLike = tag === 'button' || (tag === 'a' && !isFlex);

  const node = createInterchangeNode('frame', {
    name: tag,
    clip: style.clip ?? false,
  });
  applyVisualStyle(node, style, state);

  const hasAbsoluteChild = Array.from(el.children).some((child) =>
    (child.getAttribute('class') ?? '').split(/\s+/).includes('absolute'),
  );

  let direction: 'row' | 'col';
  if (isFlex) {
    direction = style.flexDirection ?? 'row';
    applyLayout(node, style, direction);
  } else if (hasAbsoluteChild) {
    direction = 'col';
    node.layoutMode = 'none';
    node.paddingTop = style.paddingTop ?? 0;
    node.paddingRight = style.paddingRight ?? 0;
    node.paddingBottom = style.paddingBottom ?? 0;
    node.paddingLeft = style.paddingLeft ?? 0;
    addWarning(
      state,
      'container with absolutely-positioned children keeps manual positioning; static siblings may overlap',
    );
  } else if (isButtonLike) {
    direction = 'row';
    applyLayout(node, { alignItems: 'center', justifyContent: 'center', gap: 8, ...style }, 'row');
  } else {
    direction = 'col';
    applyLayout(node, style, 'col');
  }

  applySizing(node, style, parentDirection);
  applyAbsolutePosition(node, style);

  const childCtx = childTextContext(ctx, style, style.fontSize ?? ctx.fontSize ?? 16);
  node.children = parseChildren(el, childCtx, direction, state);

  if (node.layoutMode !== 'none' && style.alignItems === undefined) {
    applyCssStretchDefaults(node.children, direction);
  }
  return node;
}

function buildFormPlaceholder(
  el: Element,
  style: TailwindStyle,
  parentDirection: 'row' | 'col' | null,
  state: ParseState,
): InterchangeNode {
  addWarning(state, `form control <${tagName(el)}> imported as a placeholder frame`);
  const node = createInterchangeNode('frame', {
    name: tagName(el),
    width: style.width ?? 200,
    height: style.height ?? 40,
    clip: true,
  });
  applyVisualStyle(node, style, state);
  if (node.strokes.length === 0) {
    node.strokes = strokesFromStyle({ borderWidth: 1, borderColor: '#d1d5db' }, state);
  }
  if (node.cornerRadius === undefined) node.cornerRadius = 6;
  applySizing(node, style, parentDirection);
  applyAbsolutePosition(node, style);
  return node;
}

function parseElement(
  el: Element,
  ctx: InheritedTextStyle,
  parentDirection: 'row' | 'col' | null,
  state: ParseState,
): InterchangeNode | null {
  const tag = tagName(el);
  if (SKIP_TAGS.has(tag)) return null;

  const style = elementStyle(el, state);

  if (tag === 'img') return buildImageNode(el, style, parentDirection);
  if (tag === 'svg') return buildSvgNode(el, style, parentDirection);
  if (tag === 'hr') {
    return buildRectangleNode(
      'divider',
      { height: 1, backgroundColor: style.backgroundColor ?? '#e5e7eb', widthFull: true, ...style },
      parentDirection,
      state,
    );
  }
  if (FORM_TAGS.has(tag)) return buildFormPlaceholder(el, style, parentDirection, state);
  if (PLACEHOLDER_TAGS.has(tag)) {
    addWarning(state, `<${tag}> imported as a placeholder rectangle`);
    return buildRectangleNode(
      tag,
      { backgroundColor: '#e5e7eb', ...style },
      parentDirection,
      state,
    );
  }
  if (tag === 'table' || tag === 'thead' || tag === 'tbody') {
    addWarning(state, 'tables are approximated as vertical stacks');
  }

  const textOnly = isTextOnly(el);
  if (textOnly && hasTextContent(el)) {
    const isNaturalText = TEXT_TAGS.has(tag) || INLINE_TAGS.has(tag);
    const wantsWrapper = tag === 'button' || tag === 'a' || needsWrapperFrame(style);
    if (!wantsWrapper && (isNaturalText || tag === 'div')) {
      return buildTextNode(el, style, ctx, parentDirection, state);
    }
    return buildContainerNode(el, style, ctx, parentDirection, state);
  }

  if (el.children.length === 0) {
    if (hasTextContent(el)) {
      return buildTextNode(el, style, ctx, parentDirection, state);
    }
    return buildRectangleNode(tag, style, parentDirection, state);
  }

  return buildContainerNode(el, style, ctx, parentDirection, state);
}

function parseChildren(
  el: Element,
  ctx: InheritedTextStyle,
  direction: 'row' | 'col',
  state: ParseState,
): InterchangeNode[] {
  const nodes: InterchangeNode[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const text = collapseWhitespace(child.textContent ?? '').trim();
      if (text.length > 0) {
        nodes.push(
          createInterchangeNode('text', {
            name: text.slice(0, 30),
            width: 200,
            height: Math.ceil((ctx.fontSize ?? 16) * (ctx.lineHeight ?? 1.2)),
            content: text,
            fontSize: ctx.fontSize ?? 16,
            fontWeight: ctx.fontWeight ?? 400,
            fontFamily: ctx.fontFamily ?? 'Inter',
            fontStyle: ctx.fontStyle ?? 'normal',
            textAlign: ctx.textAlign ?? 'left',
            lineHeight: ctx.lineHeight ?? 1.2,
            letterSpacing: ctx.letterSpacing ?? 0,
            textTransform: ctx.textTransform ?? 'none',
            textAutoResize: 'width',
            fills: [{ color: ctx.color ?? '#000000', opacity: 1, visible: true }],
          }),
        );
      }
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const node = parseElement(child as Element, ctx, direction, state);
    if (node) nodes.push(node);
  }
  return nodes;
}

function finalizeFrameSizing(node: InterchangeNode): void {
  if (node.type === 'frame' && node.layoutMode !== undefined && node.layoutMode !== 'none') {
    if (node.layoutSizingHorizontal === undefined) node.layoutSizingHorizontal = 'hug';
    if (node.layoutSizingVertical === undefined) node.layoutSizingVertical = 'hug';
  }
  for (const child of node.children) {
    finalizeFrameSizing(child);
  }
}

export function parseHtml(html: string): HtmlParseResult {
  const isFullDocument = /<body[\s>]/i.test(html);
  const source = isFullDocument ? html : `<!DOCTYPE html><html><body>${html}</body></html>`;
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const body = parsed.body ?? parsed.documentElement;
  if (!body) {
    throw new Error('Could not parse HTML');
  }

  const state: ParseState = { warnings: new Map() };
  const nodes = parseChildren(body as unknown as Element, {}, 'col', state);

  if (nodes.length === 0) {
    throw new Error('No importable elements found in the HTML');
  }

  for (const node of nodes) {
    finalizeFrameSizing(node);
  }

  let rootNodes = nodes;
  if (nodes.length > 1) {
    const wrapper = createInterchangeNode('frame', {
      name: 'Imported HTML',
      clip: false,
      layoutMode: 'vertical',
      layoutGap: 24,
      layoutAlign: 'start',
      layoutJustify: 'start',
      layoutSizingHorizontal: 'hug',
      layoutSizingVertical: 'hug',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [],
      children: nodes,
    });
    rootNodes = [wrapper];
  }

  const warnings = [...state.warnings.entries()].map(([message, count]) =>
    count > 1 ? `${message} (x${count})` : message,
  );

  return {
    doc: createInterchangeDocument(rootNodes, { source: 'html', platform: 'html' }),
    warnings,
  };
}
