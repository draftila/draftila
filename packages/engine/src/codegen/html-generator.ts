import type { Shape, TextShape, ImageShape, SvgShape, TextSegment } from '@draftila/shared';
import type { ShapeTreeNode, ShapeContext } from './types';
import {
  buildShapeTree,
  sanitizeName,
  indent,
  escapeHtml,
  sanitizeSvgContent,
  childContextForShape,
  isVectorShape,
  shapeToInlineSvg,
} from './helpers';
import { shapeToProperties } from './css-generator';
import { shapeToClasses } from './tailwind-generator';

interface CssContext {
  cssBlocks: string[];
  usedNames: Map<string, number>;
}

function uniqueClassName(name: string, fallback: string, usedNames: Map<string, number>): string {
  const baseName = sanitizeName(name, fallback);
  const count = usedNames.get(baseName) ?? 0;
  usedNames.set(baseName, count + 1);
  return count > 0 ? `${baseName}-${count + 1}` : baseName;
}

function textSegmentToCssProperties(segment: TextSegment): string[] {
  const props: string[] = [];
  if (segment.color) props.push(`color: ${segment.color};`);
  if (segment.fontSize) props.push(`font-size: ${segment.fontSize}px;`);
  if (segment.fontFamily) props.push(`font-family: '${segment.fontFamily}';`);
  if (segment.fontWeight) props.push(`font-weight: ${segment.fontWeight};`);
  if (segment.fontStyle === 'italic') props.push('font-style: italic;');
  if (segment.textDecoration && segment.textDecoration !== 'none') {
    const decoration = segment.textDecoration === 'strikethrough' ? 'line-through' : 'underline';
    props.push(`text-decoration: ${decoration};`);
  }
  if (segment.letterSpacing) props.push(`letter-spacing: ${segment.letterSpacing}px;`);
  return props;
}

function textSegmentToTailwindClasses(segment: TextSegment): string[] {
  const classes: string[] = [];
  if (segment.color) classes.push(`text-[${segment.color}]`);
  if (segment.fontSize) classes.push(`text-[${segment.fontSize}px]`);
  if (segment.fontFamily) classes.push(`font-['${segment.fontFamily.replaceAll(' ', '_')}']`);
  if (segment.fontWeight) classes.push(`font-[${segment.fontWeight}]`);
  if (segment.fontStyle === 'italic') classes.push('italic');
  if (segment.textDecoration && segment.textDecoration !== 'none') {
    classes.push(segment.textDecoration === 'strikethrough' ? 'line-through' : 'underline');
  }
  if (segment.letterSpacing) classes.push(`tracking-[${segment.letterSpacing}px]`);
  return classes;
}

function nodeToHtmlCss(
  node: ShapeTreeNode,
  ctx: CssContext,
  depth: number,
  shapeCtx?: ShapeContext,
): string {
  if (!node.shape.visible) return '';

  const shape = node.shape;
  const isVector = isVectorShape(shape);
  const effectiveCtx = isVector ? { ...shapeCtx, layoutOnly: true } : shapeCtx;
  const className = uniqueClassName(shape.name, shape.type, ctx.usedNames);
  const cssProps = shapeToProperties(shape, effectiveCtx);

  if (cssProps.length > 0) {
    ctx.cssBlocks.push(`.${className} {\n${cssProps.map((p) => `  ${p}`).join('\n')}\n}`);
  }

  if (shape.type === 'text') {
    const textShape = shape as TextShape;
    const inner = renderTextContentCss(textShape, className, ctx);
    return indent(`<p class="${className}">${inner}</p>`, depth);
  }

  if (shape.type === 'image') {
    const imgShape = shape as ImageShape;
    const src = escapeHtml(imgShape.src || '');
    return indent(`<img class="${className}" src="${src}" alt="" />`, depth);
  }

  if (shape.type === 'svg') {
    const svgShape = shape as SvgShape;
    if (svgShape.svgContent) {
      const safe = sanitizeSvgContent(svgShape.svgContent);
      return indent(`<div class="${className}">\n  ${safe}\n</div>`, depth);
    }
    return indent(`<div class="${className}"></div>`, depth);
  }

  if (isVector) {
    const svg = shapeToInlineSvg(shape);
    return indent(`<div class="${className}">\n  ${svg}\n</div>`, depth);
  }

  const isContainer = shape.type === 'frame' || shape.type === 'group';
  if (isContainer && node.children.length > 0) {
    const childCtx = childContextForShape(shape);
    const childrenHtml = node.children
      .map((child) => nodeToHtmlCss(child, ctx, depth + 1, childCtx))
      .filter(Boolean)
      .join('\n');
    return (
      indent(`<div class="${className}">`, depth) +
      '\n' +
      childrenHtml +
      '\n' +
      indent('</div>', depth)
    );
  }

  return indent(`<div class="${className}"></div>`, depth);
}

function renderTextContentCss(shape: TextShape, _parentClass: string, ctx: CssContext): string {
  if (!shape.segments || shape.segments.length === 0) {
    return escapeHtml(shape.content);
  }

  return shape.segments
    .map((segment) => {
      const segClass = uniqueClassName(`${shape.name || 'text'}-segment`, 'segment', ctx.usedNames);
      const segProps = textSegmentToCssProperties(segment);
      if (segProps.length > 0) {
        ctx.cssBlocks.push(`.${segClass} {\n${segProps.map((p) => `  ${p}`).join('\n')}\n}`);
      }
      return `<span class="${segClass}">${escapeHtml(segment.text)}</span>`;
    })
    .join('');
}

function nodeToHtmlTailwind(node: ShapeTreeNode, depth: number, shapeCtx?: ShapeContext): string {
  if (!node.shape.visible) return '';

  const shape = node.shape;
  const isVector = isVectorShape(shape);
  const effectiveCtx = isVector ? { ...shapeCtx, layoutOnly: true } : shapeCtx;
  const classes = shapeToClasses(shape, effectiveCtx).join(' ');

  if (shape.type === 'text') {
    const textShape = shape as TextShape;
    const inner = renderTextContentTailwind(textShape);
    return indent(`<p class="${classes}">${inner}</p>`, depth);
  }

  if (shape.type === 'image') {
    const imgShape = shape as ImageShape;
    const src = escapeHtml(imgShape.src || '');
    return indent(`<img class="${classes}" src="${src}" alt="" />`, depth);
  }

  if (shape.type === 'svg') {
    const svgShape = shape as SvgShape;
    if (svgShape.svgContent) {
      const safe = sanitizeSvgContent(svgShape.svgContent);
      return indent(`<div class="${classes}">\n  ${safe}\n</div>`, depth);
    }
    return indent(`<div class="${classes}"></div>`, depth);
  }

  if (isVector) {
    const svg = shapeToInlineSvg(shape);
    return indent(`<div class="${classes}">\n  ${svg}\n</div>`, depth);
  }

  const isContainer = shape.type === 'frame' || shape.type === 'group';
  if (isContainer && node.children.length > 0) {
    const childCtx = childContextForShape(shape);
    const childrenHtml = node.children
      .map((child) => nodeToHtmlTailwind(child, depth + 1, childCtx))
      .filter(Boolean)
      .join('\n');
    return (
      indent(`<div class="${classes}">`, depth) +
      '\n' +
      childrenHtml +
      '\n' +
      indent('</div>', depth)
    );
  }

  return indent(`<div class="${classes}"></div>`, depth);
}

function renderTextContentTailwind(shape: TextShape): string {
  if (!shape.segments || shape.segments.length === 0) {
    return escapeHtml(shape.content);
  }

  return shape.segments
    .map((segment) => {
      const segClasses = textSegmentToTailwindClasses(segment);
      if (segClasses.length > 0) {
        return `<span class="${segClasses.join(' ')}">${escapeHtml(segment.text)}</span>`;
      }
      return escapeHtml(segment.text);
    })
    .join('');
}

export interface HtmlCssOutput {
  html: string;
  css: string;
}

export interface HtmlTailwindOutput {
  html: string;
}

export function generateHtmlCssParts(shapes: Shape[]): HtmlCssOutput {
  if (shapes.length === 0) return { html: '', css: '' };

  const tree = buildShapeTree(shapes);
  const ctx: CssContext = {
    cssBlocks: [],
    usedNames: new Map(),
  };

  const html = tree
    .map((node) => nodeToHtmlCss(node, ctx, 1))
    .filter(Boolean)
    .join('\n');

  const css = ctx.cssBlocks.join('\n\n');

  return { html, css };
}

export function generateHtmlTailwindParts(shapes: Shape[]): HtmlTailwindOutput {
  if (shapes.length === 0) return { html: '' };

  const tree = buildShapeTree(shapes);

  const html = tree
    .map((node) => nodeToHtmlTailwind(node, 1))
    .filter(Boolean)
    .join('\n');

  return { html };
}

export function generateHtmlCss(shapes: Shape[]): string {
  const { html, css } = generateHtmlCssParts(shapes);
  if (!html) return '';
  return assembleCssDocument(html, css);
}

export function generateHtmlTailwind(shapes: Shape[], inlineScript?: string): string {
  const { html } = generateHtmlTailwindParts(shapes);
  if (!html) return '';
  return assembleTailwindDocument(html, inlineScript);
}

export function assembleHtmlWithCssLink(bodyHtml: string, cssFileName: string): string {
  const resetCss = '* { margin: 0; padding: 0; box-sizing: border-box; }';
  const bodyCss = 'body { display: flex; justify-content: center; padding: 16px; }';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssFileName}">
  <style>
    ${resetCss}
    ${bodyCss}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function assembleCssDocument(bodyHtml: string, css: string): string {
  const resetCss = '* { margin: 0; padding: 0; box-sizing: border-box; }';
  const bodyCss = 'body { display: flex; justify-content: center; padding: 16px; }';
  const styleContent = [resetCss, bodyCss, css].filter(Boolean).join('\n    ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${styleContent}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export const TAILWIND_CDN_URL = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';

function assembleTailwindDocument(bodyHtml: string, inlineScript?: string): string {
  const scriptTag = inlineScript
    ? `<script>${inlineScript}</script>`
    : `<script src="${TAILWIND_CDN_URL}"></script>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${scriptTag}
  <style type="text/tailwindcss">
    body { display: flex; justify-content: center; padding: 16px; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
