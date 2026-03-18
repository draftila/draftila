import type { Shape } from '@draftila/shared';

type TextAutoResize = 'none' | 'width' | 'height';

interface TextMeasureShape {
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle?: string;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: string;
  textAutoResize?: TextAutoResize;
  width: number;
  height: number;
}

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

function applyTransform(content: string, transform?: string): string {
  if (!transform || transform === 'none') return content;
  if (transform === 'uppercase') return content.toUpperCase();
  if (transform === 'lowercase') return content.toLowerCase();
  if (transform === 'capitalize') return content.replace(/\b\w/g, (c) => c.toUpperCase());
  return content;
}

function measureSingleLineWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

function measureWrappedHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeightPx: number,
): number {
  const paragraphs = text.split('\n');
  let lineCount = 0;

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lineCount++;
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lineCount++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) lineCount++;
  }

  return Math.max(1, lineCount) * lineHeightPx;
}

export function computeTextAutoResizeDimensions(
  shape: TextMeasureShape,
): { width: number; height: number } | null {
  const mode = shape.textAutoResize ?? 'none';
  if (mode === 'none') return null;

  const ctx = getMeasureCtx();
  if (!ctx) return null;

  const fontStyle = shape.fontStyle === 'italic' ? 'italic' : '';
  ctx.font = `${fontStyle} ${shape.fontWeight} ${shape.fontSize}px ${shape.fontFamily}`.trim();
  if (shape.letterSpacing) {
    ctx.letterSpacing = `${shape.letterSpacing}px`;
  }

  const content = applyTransform(shape.content || ' ', shape.textTransform);
  const lineHeightPx = shape.fontSize * shape.lineHeight;
  const padding = 4;

  if (mode === 'width') {
    const lines = content.split('\n');
    let maxWidth = 0;
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, measureSingleLineWidth(ctx, line || ' '));
    }

    const totalHeight = lines.length * lineHeightPx;

    ctx.letterSpacing = '0px';
    return {
      width: Math.ceil(maxWidth) + padding,
      height: Math.max(Math.ceil(totalHeight), lineHeightPx),
    };
  }

  if (mode === 'height') {
    const totalHeight = measureWrappedHeight(ctx, content, shape.width, lineHeightPx);

    ctx.letterSpacing = '0px';
    return {
      width: shape.width,
      height: Math.max(Math.ceil(totalHeight), lineHeightPx),
    };
  }

  ctx.letterSpacing = '0px';
  return null;
}

export function applyTextAutoResize(shape: Shape): Partial<Shape> | null {
  if (shape.type !== 'text') return null;
  const textShape = shape as Shape & TextMeasureShape;
  const dims = computeTextAutoResizeDimensions(textShape);
  if (!dims) return null;

  const patch: Partial<Shape> = {};
  if (Math.abs(dims.width - shape.width) > 0.5) {
    (patch as Record<string, unknown>)['width'] = dims.width;
  }
  if (Math.abs(dims.height - shape.height) > 0.5) {
    (patch as Record<string, unknown>)['height'] = dims.height;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}
