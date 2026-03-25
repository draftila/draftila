import type { RenderTransform, TextRenderOptions } from './types';
import type { StyleEngine } from './style-engine';
import { resolveCanvasFontFamily } from '../font-manager';
import { applyTextTransform, colorWithOpacity, truncateLine, wrapText } from './style-utils';

export function drawText(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  options: TextRenderOptions,
) {
  ctx.save();
  se.applyTransform(transform);

  const layerBlur = options.blurs.find((b) => b.type === 'layer' && b.visible !== false);
  if (layerBlur && layerBlur.radius > 0) {
    ctx.filter = `blur(${layerBlur.radius}px)`;
  }

  const dropShadow = options.shadows.find((s) => s.type === 'drop' && s.visible !== false);
  if (dropShadow) {
    se.applyDropShadow(dropShadow);
  }

  if (options.segments && options.segments.length > 0) {
    drawSegmentedText(ctx, se, transform, options);
  } else {
    drawPlainText(ctx, se, transform, options);
  }

  ctx.restore();
}

function drawPlainText(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  options: TextRenderOptions,
) {
  const fontStyle = options.fontStyle === 'italic' ? 'italic' : '';
  const resolvedFamily = resolveCanvasFontFamily(options.fontFamily);
  ctx.font = `${fontStyle} ${options.fontWeight} ${options.fontSize}px ${resolvedFamily}`.trim();
  ctx.textAlign = options.textAlign;
  ctx.textBaseline = 'middle';

  const visibleFill = options.fills.find((f) => f.visible);
  const fillStyle: string | CanvasGradient | null = visibleFill
    ? se.getFillStyle(visibleFill, transform.width, transform.height)
    : null;

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
  }

  const content = applyTextTransform(options.content, options.textTransform);
  let lines = wrapText(ctx, content, transform.width);
  const lineHeight = options.fontSize * options.lineHeight;
  const isTruncating = options.textTruncation === 'ending';

  if (isTruncating) {
    const maxLines = Math.max(1, Math.floor(transform.height / lineHeight));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      const lastLine = lines[maxLines - 1];
      if (lastLine !== undefined) {
        lines[maxLines - 1] = truncateLine(ctx, lastLine, transform.width);
      }
    }
  }

  const totalTextHeight = lines.length * lineHeight;

  let offsetY = 0;
  if (options.verticalAlign === 'middle') {
    offsetY = (transform.height - totalTextHeight) / 2;
  } else if (options.verticalAlign === 'bottom') {
    offsetY = transform.height - totalTextHeight;
  }

  let textX = 0;
  if (options.textAlign === 'center') textX = transform.width / 2;
  else if (options.textAlign === 'right') textX = transform.width;

  if (options.letterSpacing !== 0) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${options.letterSpacing}px`;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const y = offsetY + i * lineHeight + lineHeight / 2;
    if (fillStyle) {
      ctx.fillText(line, textX, y);
    }

    if (options.textDecoration !== 'none') {
      const metrics = ctx.measureText(line);
      let lineStartX = textX;
      if (options.textAlign === 'center') lineStartX = textX - metrics.width / 2;
      else if (options.textAlign === 'right') lineStartX = textX - metrics.width;
      const lineTopY = y - lineHeight / 2;
      const decoY =
        options.textDecoration === 'strikethrough'
          ? lineTopY + options.fontSize * 0.55
          : lineTopY + options.fontSize * 0.95;
      ctx.beginPath();
      ctx.strokeStyle =
        typeof fillStyle === 'string' ? fillStyle : visibleFill ? visibleFill.color : '#000000';
      ctx.lineWidth = Math.max(1, options.fontSize / 16);
      ctx.moveTo(lineStartX, decoY);
      ctx.lineTo(lineStartX + metrics.width, decoY);
      ctx.stroke();
    }
  }
}

function drawSegmentedText(
  ctx: CanvasRenderingContext2D,
  se: StyleEngine,
  transform: RenderTransform,
  options: TextRenderOptions,
) {
  const segments = options.segments!;

  const baseFontStyle = options.fontStyle === 'italic' ? 'italic' : '';
  const baseFontWeight = options.fontWeight;
  const baseFontSize = options.fontSize;
  const baseFontFamily = resolveCanvasFontFamily(options.fontFamily);
  const baseLetterSpacing = options.letterSpacing;

  const visibleFill = options.fills.find((f) => f.visible);
  const baseColor = visibleFill
    ? colorWithOpacity(visibleFill.color, visibleFill.opacity)
    : '#000000';

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const fullText = segments.map((s) => s.text).join('');
  const content = applyTextTransform(fullText, options.textTransform);

  ctx.font = `${baseFontStyle} ${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`.trim();
  if (baseLetterSpacing !== 0) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${baseLetterSpacing}px`;
  }
  let lines = wrapText(ctx, content, transform.width);
  const lineHeight = baseFontSize * options.lineHeight;
  const isTruncating = options.textTruncation === 'ending';

  if (isTruncating) {
    const maxLines = Math.max(1, Math.floor(transform.height / lineHeight));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      const lastLine = lines[maxLines - 1];
      if (lastLine !== undefined) {
        lines[maxLines - 1] = truncateLine(ctx, lastLine, transform.width);
      }
    }
  }

  const totalTextHeight = lines.length * lineHeight;

  let offsetY = 0;
  if (options.verticalAlign === 'middle') {
    offsetY = (transform.height - totalTextHeight) / 2;
  } else if (options.verticalAlign === 'bottom') {
    offsetY = transform.height - totalTextHeight;
  }

  interface CharStyle {
    char: string;
    color: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    fontStyle: string;
    letterSpacing: number;
    textDecoration: string;
    gradient?: NonNullable<(typeof segments)[number]['gradient']>;
  }

  const charStyles: CharStyle[] = [];
  let segOffset = 0;
  for (const seg of segments) {
    const segText = content.substring(segOffset, segOffset + seg.text.length);
    for (const char of segText) {
      charStyles.push({
        char,
        color: seg.color ?? baseColor,
        fontSize: seg.fontSize ?? baseFontSize,
        fontFamily: seg.fontFamily ? resolveCanvasFontFamily(seg.fontFamily) : baseFontFamily,
        fontWeight: seg.fontWeight ?? baseFontWeight,
        fontStyle: seg.fontStyle === 'italic' ? 'italic' : baseFontStyle,
        letterSpacing: seg.letterSpacing ?? baseLetterSpacing,
        textDecoration: seg.textDecoration ?? options.textDecoration,
        gradient: seg.gradient,
      });
    }
    segOffset += seg.text.length;
  }

  let charIdx = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line === undefined) continue;
    const y = offsetY + li * lineHeight + lineHeight / 2;

    const lineChars = charStyles.slice(charIdx, charIdx + line.length);
    charIdx += line.length;
    if (charIdx < charStyles.length && charStyles[charIdx]?.char === ' ') {
      charIdx++;
    }

    let lineWidth = 0;
    for (const cs of lineChars) {
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}px ${cs.fontFamily}`.trim();
      ctx.font = font;
      lineWidth += ctx.measureText(cs.char).width;
    }

    let startX = 0;
    if (options.textAlign === 'center') startX = (transform.width - lineWidth) / 2;
    else if (options.textAlign === 'right') startX = transform.width - lineWidth;

    let cursorX = startX;
    for (const cs of lineChars) {
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}px ${cs.fontFamily}`.trim();
      ctx.font = font;
      if (cs.letterSpacing !== 0) {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
          `${cs.letterSpacing}px`;
      }

      if (cs.gradient) {
        ctx.fillStyle = se.createGradient(cs.gradient, transform.width, transform.height);
      } else {
        ctx.fillStyle = cs.color;
      }
      ctx.fillText(cs.char, cursorX, y);

      if (cs.textDecoration !== 'none') {
        const charWidth = ctx.measureText(cs.char).width;
        const decoY =
          cs.textDecoration === 'strikethrough'
            ? y - lineHeight / 2 + cs.fontSize * 0.55
            : y - lineHeight / 2 + cs.fontSize * 0.95;
        ctx.beginPath();
        ctx.strokeStyle = cs.color;
        ctx.lineWidth = Math.max(1, cs.fontSize / 16);
        ctx.moveTo(cursorX, decoY);
        ctx.lineTo(cursorX + charWidth, decoY);
        ctx.stroke();
      }

      cursorX += ctx.measureText(cs.char).width;
    }
  }
}
