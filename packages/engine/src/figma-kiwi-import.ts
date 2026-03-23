import { decompress as zstdDecompress } from 'fzstd';
import { inflate, inflateRaw } from 'pako';
import { ByteBuffer, compileSchema, decodeBinarySchema } from './vendor/kiwi-schema';
import {
  createInterchangeDocument,
  createInterchangeNode,
  type InterchangeClipPath,
  type InterchangeDocument,
  type InterchangeFill,
  type InterchangeGradient,
  type InterchangeNode,
  type InterchangeShadow,
  type InterchangeStroke,
} from './interchange/interchange-format';

interface FigmaGuid {
  sessionID: number;
  localID: number;
}

interface FigmaParentIndex {
  guid?: FigmaGuid;
  position?: string;
}

interface FigmaColor {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}

interface FigmaGradientStop {
  color?: FigmaColor;
  position?: number;
}

interface FigmaTransform {
  m00?: number;
  m01?: number;
  m02?: number;
  m10?: number;
  m11?: number;
  m12?: number;
}

interface FigmaVector {
  x?: number;
  y?: number;
}

interface FigmaPaint {
  type?: string;
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  stops?: FigmaGradientStop[];
  transform?: FigmaTransform;
}

interface FigmaEffect {
  type?: string;
  color?: FigmaColor;
  offset?: FigmaVector;
  radius?: number;
  spread?: number;
  visible?: boolean;
}

interface FigmaNodeChange {
  guid?: FigmaGuid;
  parentIndex?: FigmaParentIndex;
  phase?: string;
  type?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: string;
  size?: FigmaVector;
  transform?: FigmaTransform;
  cornerRadius?: number;
  rectangleTopLeftCornerRadius?: number;
  rectangleTopRightCornerRadius?: number;
  rectangleBottomLeftCornerRadius?: number;
  rectangleBottomRightCornerRadius?: number;
  rectangleCornerRadiiIndependent?: boolean;
  cornerSmoothing?: number;
  fillPaints?: FigmaPaint[];
  strokePaints?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  strokeCap?: string;
  strokeJoin?: string;
  dashPattern?: number[];
  effects?: FigmaEffect[];
  clipsContent?: boolean;
  textData?: { characters?: string };
  fontSize?: number;
  fontName?: { family?: string; style?: string };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textAutoResize?: string;
  textDecoration?: string;
  lineHeight?: { value?: number; units?: string };
  letterSpacing?: { value?: number; units?: string };
  arcData?: { startingAngle?: number; endingAngle?: number; innerRadius?: number };
  itemReverseZIndex?: boolean;
}

const NON_VISUAL_TYPES = new Set([
  'DOCUMENT',
  'CANVAS',
  'VARIABLE_SET',
  'VARIABLE',
  'VARIABLE_COLLECTION',
  'STYLE',
  'STYLE_SET',
  'INTERNAL_ONLY_NODE',
  'WIDGET',
  'STAMP',
  'STICKY',
  'CODE_BLOCK',
  'TABLE_NODE',
  'TABLE_CELL',
  'SECTION_OVERLAY',
  'SLIDE',
]);

function base64ToUint8Array(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeInflate(data: Uint8Array): Uint8Array {
  if (
    data.length >= 4 &&
    data[0] === 0x28 &&
    data[1] === 0xb5 &&
    data[2] === 0x2f &&
    data[3] === 0xfd
  ) {
    return zstdDecompress(data);
  }
  try {
    return inflateRaw(data);
  } catch {
    try {
      return inflate(data);
    } catch {
      try {
        return zstdDecompress(data);
      } catch {
        return data;
      }
    }
  }
}

const compiledSchemaCache = new Map<string, { decodeMessage: (data: Uint8Array) => unknown }>();

function getCompiledSchema(schemaBytes: Uint8Array): {
  decodeMessage: (data: Uint8Array) => unknown;
} {
  const cacheKey = Array.from(schemaBytes.slice(0, 32))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const cached = compiledSchemaCache.get(cacheKey);
  if (cached) return cached;

  const schema = decodeBinarySchema(new ByteBuffer(schemaBytes));
  const compiled = compileSchema(schema) as { decodeMessage: (data: Uint8Array) => unknown };
  compiledSchemaCache.set(cacheKey, compiled);
  return compiled;
}

function parseFigKiwiChunks(binary: Uint8Array): Uint8Array[] | null {
  const header = new TextDecoder().decode(binary.slice(0, 8));
  if (header !== 'fig-kiwi') return null;

  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  let offset = 12;
  const chunks: Uint8Array[] = [];

  while (offset + 4 <= binary.length) {
    const chunkLength = view.getUint32(offset, true);
    offset += 4;
    if (chunkLength === 0 || offset + chunkLength > binary.length) break;
    chunks.push(binary.slice(offset, offset + chunkLength));
    offset += chunkLength;
  }

  return chunks.length >= 2 ? chunks : null;
}

function guidToString(guid: FigmaGuid | undefined): string | null {
  if (!guid) return null;
  return `${guid.sessionID}:${guid.localID}`;
}

function colorToHex(color: FigmaColor | undefined): string {
  const r = Math.max(0, Math.min(255, Math.round((color?.r ?? 0) * 255)));
  const g = Math.max(0, Math.min(255, Math.round((color?.g ?? 0) * 255)));
  const b = Math.max(0, Math.min(255, Math.round((color?.b ?? 0) * 255)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
}

function colorOpacity(color: FigmaColor | undefined, opacity: number | undefined): number {
  const alpha = color?.a ?? 1;
  return Math.max(0, Math.min(1, alpha * (opacity ?? 1)));
}

function toInterchangeGradient(paint: FigmaPaint): InterchangeGradient | null {
  if (!paint.type?.startsWith('GRADIENT') || !paint.stops || paint.stops.length === 0) return null;

  const stops = paint.stops.map((stop) => ({
    color: colorToHex(stop.color),
    position: stop.position ?? 0,
  }));

  if (paint.type === 'GRADIENT_RADIAL') {
    return {
      type: 'radial',
      stops,
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
    };
  }

  const t = paint.transform;
  const angle = t ? (Math.atan2(t.m10 ?? 0, t.m00 ?? 1) * 180) / Math.PI : 0;
  return {
    type: 'linear',
    stops,
    angle,
  };
}

function toInterchangeFills(paints: FigmaPaint[] | undefined): {
  fills: InterchangeFill[];
  gradients: InterchangeGradient[];
} {
  const fills: InterchangeFill[] = [];
  const gradients: InterchangeGradient[] = [];

  for (const paint of paints ?? []) {
    if (paint.visible === false) continue;
    const gradient = toInterchangeGradient(paint);
    if (gradient) {
      gradients.push(gradient);
      continue;
    }
    if (paint.type && paint.type !== 'SOLID') continue;
    fills.push({
      color: colorToHex(paint.color),
      opacity: colorOpacity(paint.color, paint.opacity),
      visible: true,
    });
  }

  return { fills, gradients };
}

function toInterchangeStrokes(
  paints: FigmaPaint[] | undefined,
  weight: number | undefined,
  align: string | undefined,
  cap: string | undefined,
  join: string | undefined,
  dashPattern: number[] | undefined,
): InterchangeStroke[] {
  const strokes: InterchangeStroke[] = [];

  for (const paint of paints ?? []) {
    if (paint.visible === false) continue;
    const gradient = toInterchangeGradient(paint) ?? undefined;
    strokes.push({
      color: colorToHex(paint.color),
      width: weight ?? 1,
      opacity: colorOpacity(paint.color, paint.opacity),
      visible: true,
      gradient,
      cap: cap === 'ROUND' ? 'round' : cap === 'SQUARE' ? 'square' : 'butt',
      join: join === 'ROUND' ? 'round' : join === 'BEVEL' ? 'bevel' : 'miter',
      align: align === 'INSIDE' ? 'inside' : align === 'OUTSIDE' ? 'outside' : 'center',
      dashPattern: dashPattern && dashPattern.length > 0 ? 'dash' : 'solid',
      dashArray: dashPattern,
      dashOffset: 0,
      miterLimit: 4,
    });
  }

  return strokes;
}

function toInterchangeShadows(effects: FigmaEffect[] | undefined): InterchangeShadow[] {
  const shadows: InterchangeShadow[] = [];

  for (const effect of effects ?? []) {
    if (effect.visible === false) continue;

    if (effect.type === 'DROP_SHADOW') {
      shadows.push({
        type: 'drop',
        x: effect.offset?.x ?? 0,
        y: effect.offset?.y ?? 0,
        blur: effect.radius ?? 0,
        spread: effect.spread ?? 0,
        color: colorToHex(effect.color),
        visible: true,
      });
      continue;
    }

    if (effect.type === 'INNER_SHADOW') {
      shadows.push({
        type: 'inner',
        x: effect.offset?.x ?? 0,
        y: effect.offset?.y ?? 0,
        blur: effect.radius ?? 0,
        spread: effect.spread ?? 0,
        color: colorToHex(effect.color),
        visible: true,
      });
    }
  }

  return shadows;
}

function styleToWeight(style: string | undefined): number {
  const value = (style ?? '').toLowerCase();
  if (value.includes('thin')) return 100;
  if (value.includes('extralight') || value.includes('ultralight')) return 200;
  if (value.includes('light')) return 300;
  if (value.includes('medium')) return 500;
  if (value.includes('semibold') || value.includes('demibold')) return 600;
  if (value.includes('extrabold') || value.includes('ultrabold')) return 800;
  if (value.includes('black') || value.includes('heavy')) return 900;
  if (value.includes('bold')) return 700;
  return 400;
}

function convertLineHeight(
  lineHeight: FigmaNodeChange['lineHeight'],
  fontSize: number,
): number | undefined {
  if (!lineHeight?.value) return undefined;
  if (lineHeight.units === 'PERCENT') return lineHeight.value / 100;
  if (lineHeight.units === 'PIXELS') return lineHeight.value / fontSize;
  return undefined;
}

function convertLetterSpacing(
  letterSpacing: FigmaNodeChange['letterSpacing'],
  fontSize: number,
): number {
  if (!letterSpacing?.value) return 0;
  if (letterSpacing.units === 'PERCENT') return (letterSpacing.value / 100) * fontSize;
  return letterSpacing.value;
}

function transformToBounds(change: FigmaNodeChange): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
} {
  const x = change.transform?.m02 ?? 0;
  const y = change.transform?.m12 ?? 0;
  const width = change.size?.x ?? 100;
  const height = change.size?.y ?? 100;
  const det =
    (change.transform?.m00 ?? 1) * (change.transform?.m11 ?? 1) -
    (change.transform?.m01 ?? 0) * (change.transform?.m10 ?? 0);
  const sx = det < 0 ? -1 : 1;
  const rotation =
    (Math.atan2((change.transform?.m10 ?? 0) * sx, (change.transform?.m00 ?? 1) * sx) * 180) /
      Math.PI || 0;

  return { x, y, width, height, rotation };
}

function isVisualNode(change: FigmaNodeChange): boolean {
  return !!change.type && !NON_VISUAL_TYPES.has(change.type) && change.phase !== 'REMOVED';
}

function makeClipPath(change: FigmaNodeChange): InterchangeClipPath | undefined {
  if (!change.clipsContent) return undefined;
  const { x, y, width, height } = transformToBounds(change);
  return {
    type: 'rect',
    x,
    y,
    width,
    height,
    rx: change.cornerRadius,
    ry: change.cornerRadius,
  };
}

function toTextNode(change: FigmaNodeChange): InterchangeNode {
  const { x, y, width, height, rotation } = transformToBounds(change);
  const { fills, gradients } = toInterchangeFills(change.fillPaints);
  const content = change.textData?.characters ?? '';
  const fontSize = change.fontSize ?? 16;
  const fontStyle = change.fontName?.style?.toLowerCase().includes('italic') ? 'italic' : 'normal';

  return createInterchangeNode('text', {
    name: change.name ?? 'Text',
    x,
    y,
    width,
    height,
    rotation,
    opacity: change.opacity ?? 1,
    visible: change.visible ?? true,
    locked: change.locked ?? false,
    blendMode: (change.blendMode ?? 'NORMAL').toLowerCase(),
    fills,
    gradients,
    shadows: toInterchangeShadows(change.effects),
    content,
    textAutoResize:
      change.textAutoResize === 'WIDTH_AND_HEIGHT'
        ? 'width'
        : change.textAutoResize === 'HEIGHT'
          ? 'height'
          : 'none',
    fontSize,
    fontFamily: change.fontName?.family ?? 'Inter',
    fontWeight: styleToWeight(change.fontName?.style),
    fontStyle,
    textAlign:
      change.textAlignHorizontal === 'CENTER'
        ? 'center'
        : change.textAlignHorizontal === 'RIGHT'
          ? 'right'
          : 'left',
    verticalAlign:
      change.textAlignVertical === 'CENTER'
        ? 'middle'
        : change.textAlignVertical === 'BOTTOM'
          ? 'bottom'
          : 'top',
    lineHeight: convertLineHeight(change.lineHeight, fontSize),
    letterSpacing: convertLetterSpacing(change.letterSpacing, fontSize),
    textDecoration:
      change.textDecoration === 'UNDERLINE'
        ? 'underline'
        : change.textDecoration === 'STRIKETHROUGH'
          ? 'strikethrough'
          : 'none',
  });
}

function toRectangleNode(change: FigmaNodeChange): InterchangeNode {
  const { x, y, width, height, rotation } = transformToBounds(change);
  const { fills, gradients } = toInterchangeFills(change.fillPaints);

  return createInterchangeNode('rectangle', {
    name: change.name ?? 'Rectangle',
    x,
    y,
    width,
    height,
    rotation,
    opacity: change.opacity ?? 1,
    visible: change.visible ?? true,
    locked: change.locked ?? false,
    blendMode: (change.blendMode ?? 'NORMAL').toLowerCase(),
    fills,
    gradients,
    strokes: toInterchangeStrokes(
      change.strokePaints,
      change.strokeWeight,
      change.strokeAlign,
      change.strokeCap,
      change.strokeJoin,
      change.dashPattern,
    ),
    shadows: toInterchangeShadows(change.effects),
    cornerRadius: change.cornerRadius,
    cornerRadiusTL: change.rectangleTopLeftCornerRadius,
    cornerRadiusTR: change.rectangleTopRightCornerRadius,
    cornerRadiusBL: change.rectangleBottomLeftCornerRadius,
    cornerRadiusBR: change.rectangleBottomRightCornerRadius,
    cornerSmoothing: change.cornerSmoothing,
  });
}

function toEllipseNode(change: FigmaNodeChange): InterchangeNode {
  const { x, y, width, height, rotation } = transformToBounds(change);
  const { fills, gradients } = toInterchangeFills(change.fillPaints);

  return createInterchangeNode('ellipse', {
    name: change.name ?? 'Ellipse',
    x,
    y,
    width,
    height,
    rotation,
    opacity: change.opacity ?? 1,
    visible: change.visible ?? true,
    locked: change.locked ?? false,
    blendMode: (change.blendMode ?? 'NORMAL').toLowerCase(),
    fills,
    gradients,
    strokes: toInterchangeStrokes(
      change.strokePaints,
      change.strokeWeight,
      change.strokeAlign,
      change.strokeCap,
      change.strokeJoin,
      change.dashPattern,
    ),
    shadows: toInterchangeShadows(change.effects),
  });
}

function toLineNode(change: FigmaNodeChange): InterchangeNode {
  const { x, y, width, height, rotation } = transformToBounds(change);
  const radians = (rotation * Math.PI) / 180;
  const x2 = x + width * Math.cos(radians);
  const y2 = y + width * Math.sin(radians);

  return createInterchangeNode('line', {
    name: change.name ?? 'Line',
    x: Math.min(x, x2),
    y: Math.min(y, y2),
    width: Math.abs(x2 - x) || width || 1,
    height: Math.abs(y2 - y) || height || 1,
    rotation,
    opacity: change.opacity ?? 1,
    visible: change.visible ?? true,
    locked: change.locked ?? false,
    blendMode: (change.blendMode ?? 'NORMAL').toLowerCase(),
    strokes: toInterchangeStrokes(
      change.strokePaints,
      change.strokeWeight,
      change.strokeAlign,
      change.strokeCap,
      change.strokeJoin,
      change.dashPattern,
    ),
    shadows: toInterchangeShadows(change.effects),
    x1: x,
    y1: y,
    x2,
    y2,
  });
}

function toFrameNode(change: FigmaNodeChange, children: InterchangeNode[]): InterchangeNode {
  const { x, y, width, height, rotation } = transformToBounds(change);
  const { fills, gradients } = toInterchangeFills(change.fillPaints);
  const hasVisualFrameStyling =
    fills.length > 0 ||
    gradients.length > 0 ||
    (change.strokePaints?.length ?? 0) > 0 ||
    change.clipsContent;

  return createInterchangeNode(hasVisualFrameStyling ? 'frame' : 'group', {
    name: change.name ?? 'Group',
    x,
    y,
    width,
    height,
    rotation,
    opacity: change.opacity ?? 1,
    visible: change.visible ?? true,
    locked: change.locked ?? false,
    blendMode: (change.blendMode ?? 'NORMAL').toLowerCase(),
    fills,
    gradients,
    strokes: toInterchangeStrokes(
      change.strokePaints,
      change.strokeWeight,
      change.strokeAlign,
      change.strokeCap,
      change.strokeJoin,
      change.dashPattern,
    ),
    shadows: toInterchangeShadows(change.effects),
    clip: change.clipsContent ?? false,
    clipPath: makeClipPath(change),
    children,
  });
}

function toFallbackNode(change: FigmaNodeChange, children: InterchangeNode[]): InterchangeNode {
  if (children.length > 0) return toFrameNode(change, children);
  return toRectangleNode(change);
}

function buildNodeTree(nodeChanges: FigmaNodeChange[]): InterchangeDocument | null {
  const changeMap = new Map<string, FigmaNodeChange>();
  const childMap = new Map<string, string[]>();
  const topLevelIds: string[] = [];

  for (const change of nodeChanges) {
    if (!isVisualNode(change)) continue;
    const id = guidToString(change.guid);
    if (!id) continue;
    changeMap.set(id, change);
  }

  for (const [id, change] of changeMap) {
    const parentId = guidToString(change.parentIndex?.guid);
    if (parentId && changeMap.has(parentId)) {
      const siblings = childMap.get(parentId);
      if (siblings) siblings.push(id);
      else childMap.set(parentId, [id]);
    } else {
      topLevelIds.push(id);
    }
  }

  for (const [, siblings] of childMap) {
    siblings.sort((left, right) => {
      const leftPos = changeMap.get(left)?.parentIndex?.position ?? '';
      const rightPos = changeMap.get(right)?.parentIndex?.position ?? '';
      return leftPos.localeCompare(rightPos);
    });
  }

  const buildNode = (
    id: string,
    parentAbsX: number,
    parentAbsY: number,
  ): InterchangeNode | null => {
    const change = changeMap.get(id);
    if (!change) return null;

    const { x: relX, y: relY } = transformToBounds(change);
    const absX = parentAbsX + relX;
    const absY = parentAbsY + relY;

    const children = (childMap.get(id) ?? [])
      .map((childId) => buildNode(childId, absX, absY))
      .filter((node): node is InterchangeNode => node !== null);

    let node: InterchangeNode | null;
    switch (change.type) {
      case 'TEXT':
        node = toTextNode(change);
        break;
      case 'ELLIPSE':
        node = toEllipseNode(change);
        break;
      case 'LINE':
      case 'CONNECTOR':
        node = toLineNode(change);
        break;
      case 'RECTANGLE':
      case 'ROUNDED_RECTANGLE':
        node = toRectangleNode(change);
        break;
      case 'FRAME':
      case 'GROUP':
      case 'SECTION':
      case 'INSTANCE':
      case 'COMPONENT':
      case 'COMPONENT_SET':
      case 'BOOLEAN_OPERATION':
        node = toFrameNode(change, children);
        break;
      default:
        node = toFallbackNode(change, children);
        break;
    }

    if (node) {
      node.x = absX;
      node.y = absY;
    }

    return node;
  };

  const nodes = topLevelIds
    .map((id) => buildNode(id, 0, 0))
    .filter((node): node is InterchangeNode => node !== null);

  if (nodes.length === 0) return null;
  return createInterchangeDocument(nodes, {
    source: 'figma',
    platform: 'figma',
    version: 'clipboard',
  });
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractFigmaBase64(html: string): string | null {
  const attrMatch = html.match(/data-buffer=["']([^"']*)["']/s);
  if (attrMatch?.[1]) {
    const decoded = decodeHtmlEntities(attrMatch[1]);
    const innerMatch = decoded.match(/\(figma\)(.*?)\(\/figma\)/s);
    if (innerMatch?.[1]) return innerMatch[1];
  }

  const directMatch = html.match(/\(figma\)(.*?)\(\/figma\)/s);
  return directMatch?.[1] ?? null;
}

export function importFigmaClipboardHtml(html: string | null): InterchangeDocument | null {
  if (!html) return null;
  const base64Data = extractFigmaBase64(html);
  if (!base64Data) return null;

  const binary = base64ToUint8Array(base64Data.replace(/\s/g, ''));
  const chunks = parseFigKiwiChunks(binary);
  if (!chunks || chunks.length < 2) return null;

  const schemaBytes = safeInflate(chunks[0]!);
  const dataBytes = safeInflate(chunks[1]!);

  const compiled = getCompiledSchema(schemaBytes);
  const decoded = compiled.decodeMessage(dataBytes) as {
    nodeChanges?: FigmaNodeChange[];
  };

  if (!decoded.nodeChanges || decoded.nodeChanges.length === 0) return null;
  return buildNodeTree(decoded.nodeChanges);
}
