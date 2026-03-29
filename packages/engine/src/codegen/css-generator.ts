import type {
  Shape,
  Fill,
  Stroke,
  Shadow,
  Blur,
  FrameShape,
  TextShape,
  RectangleShape,
  LineShape,
  ImageShape,
  EllipseShape,
} from '@draftila/shared';
import type { ShapeTreeNode } from './types';
import {
  hexToRgba,
  rgbaToCssColor,
  roundTo,
  sanitizeName,
  getVisibleFills,
  getVisibleStrokes,
  getVisibleShadows,
  getVisibleBlurs,
  getEffectiveCornerRadii,
  buildShapeTree,
} from './helpers';

export function generateCss(shapes: Shape[]): string {
  if (shapes.length === 0) return '';
  const tree = buildShapeTree(shapes);
  return tree.map((node) => generateNodeCss(node.shape)).join('\n\n');
}

export function generateCssAllLayers(shapes: Shape[]): string {
  if (shapes.length === 0) return '';
  const tree = buildShapeTree(shapes);
  const blocks: string[] = [];
  const usedNames = new Map<string, number>();

  function walkTree(node: ShapeTreeNode, parentSelector: string) {
    if (!node.shape.visible) return;

    const baseName = sanitizeName(node.shape.name, node.shape.type);
    const count = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, count + 1);
    const className = count > 0 ? `${baseName}-${count + 1}` : baseName;
    const selector = parentSelector ? `${parentSelector} .${className}` : `.${className}`;

    const props = shapeToProperties(node.shape);
    if (props.length > 0) {
      blocks.push(`${selector} {\n${props.map((p) => `  ${p}`).join('\n')}\n}`);
    }

    for (const child of node.children) {
      walkTree(child, selector);
    }
  }

  for (const node of tree) {
    walkTree(node, '');
  }

  return blocks.join('\n\n');
}

function generateNodeCss(shape: Shape): string {
  const props = shapeToProperties(shape);
  if (props.length === 0) return '';
  return props.join('\n');
}

export function shapeToProperties(shape: Shape): string[] {
  switch (shape.type) {
    case 'rectangle':
      return rectangleProperties(shape);
    case 'ellipse':
      return ellipseProperties(shape);
    case 'frame':
      return frameProperties(shape);
    case 'text':
      return textProperties(shape);
    case 'path':
      return vectorProperties(shape);
    case 'polygon':
      return vectorProperties(shape);
    case 'star':
      return vectorProperties(shape);
    case 'line':
      return lineProperties(shape);
    case 'image':
      return imageProperties(shape);
    case 'svg':
      return baseDimensionProperties(shape);
    case 'group':
      return baseDimensionProperties(shape);
  }
}

function sizingToCss(shape: Shape, direction: 'width' | 'height', value: number): string | null {
  const sizing = direction === 'width' ? shape.layoutSizingHorizontal : shape.layoutSizingVertical;
  if (sizing === 'fill') return null;
  if (sizing === 'hug') return `${direction}: auto;`;
  return `${direction}: ${roundTo(value, 1)}px;`;
}

function minMaxToCss(shape: Shape): string[] {
  const props: string[] = [];
  if (shape.minWidth !== undefined) props.push(`min-width: ${roundTo(shape.minWidth, 1)}px;`);
  if (shape.maxWidth !== undefined) props.push(`max-width: ${roundTo(shape.maxWidth, 1)}px;`);
  if (shape.minHeight !== undefined) props.push(`min-height: ${roundTo(shape.minHeight, 1)}px;`);
  if (shape.maxHeight !== undefined) props.push(`max-height: ${roundTo(shape.maxHeight, 1)}px;`);
  return props;
}

function baseDimensionProperties(shape: Shape): string[] {
  const props: string[] = [];

  if (shape.layoutSizingHorizontal === 'fill') {
    props.push('flex: 1;');
    props.push('align-self: stretch;');
  }
  const w = sizingToCss(shape, 'width', shape.width);
  if (w) props.push(w);

  if (shape.layoutSizingVertical === 'fill' && shape.layoutSizingHorizontal !== 'fill') {
    props.push('align-self: stretch;');
  }
  const h = sizingToCss(shape, 'height', shape.height);
  if (h) props.push(h);

  props.push(...minMaxToCss(shape));

  if (shape.rotation !== 0) {
    props.push(`transform: rotate(${roundTo(shape.rotation, 2)}deg);`);
  }
  if (shape.opacity < 1) {
    props.push(`opacity: ${roundTo(shape.opacity, 2)};`);
  }
  if (shape.blendMode !== 'normal') {
    props.push(`mix-blend-mode: ${shape.blendMode};`);
  }
  return props;
}

function fillsToCss(fills: Fill[]): string[] {
  const visible = getVisibleFills(fills);
  if (visible.length === 0) return [];

  const layers = visible.map(fillToCssValue).reverse();

  if (layers.length === 1) {
    return [`background: ${layers[0]};`];
  }
  return [`background: ${layers.join(', ')};`];
}

function fillToCssValue(fill: Fill): string {
  if (fill.gradient) {
    return gradientToCss(fill.gradient, fill.opacity);
  }
  if (fill.imageSrc) {
    return `url("${escapeCssDoubleQuotedString(fill.imageSrc)}")`;
  }
  const rgba = hexToRgba(fill.color, fill.opacity);
  return rgbaToCssColor(rgba);
}

function escapeCssSingleQuotedString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f');
}

function escapeCssDoubleQuotedString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f');
}

function gradientToCss(gradient: NonNullable<Fill['gradient']>, opacity: number): string {
  if (gradient.type === 'linear') {
    const stops = gradient.stops
      .map((s) => {
        const rgba = hexToRgba(s.color, opacity);
        return `${rgbaToCssColor(rgba)} ${roundTo(s.position * 100, 1)}%`;
      })
      .join(', ');
    return `linear-gradient(${roundTo(gradient.angle, 1)}deg, ${stops})`;
  }

  const stops = gradient.stops
    .map((s) => {
      const rgba = hexToRgba(s.color, opacity);
      return `${rgbaToCssColor(rgba)} ${roundTo(s.position * 100, 1)}%`;
    })
    .join(', ');
  const cx = roundTo((gradient.cx ?? 0.5) * 100, 1);
  const cy = roundTo((gradient.cy ?? 0.5) * 100, 1);
  return `radial-gradient(circle at ${cx}% ${cy}%, ${stops})`;
}

function strokesToCss(strokes: Stroke[]): string[] {
  const visible = getVisibleStrokes(strokes);
  if (visible.length === 0) return [];

  const props: string[] = [];
  const stroke = visible[0]!;
  const rgba = hexToRgba(stroke.color, stroke.opacity);
  const color = rgbaToCssColor(rgba);
  const style = strokeDashToCssStyle(stroke.dashPattern);

  if (stroke.sides) {
    const sides = stroke.sides;
    if (sides.top) props.push(`border-top: ${stroke.width}px ${style} ${color};`);
    if (sides.right) props.push(`border-right: ${stroke.width}px ${style} ${color};`);
    if (sides.bottom) props.push(`border-bottom: ${stroke.width}px ${style} ${color};`);
    if (sides.left) props.push(`border-left: ${stroke.width}px ${style} ${color};`);
  } else if (stroke.align === 'outside') {
    props.push(`outline: ${stroke.width}px ${style} ${color};`);
    props.push(`outline-offset: 0;`);
  } else {
    props.push(`border: ${stroke.width}px ${style} ${color};`);
    if (stroke.align === 'inside') {
      props.push(`box-sizing: border-box;`);
    }
  }

  return props;
}

function strokeDashToCssStyle(dashPattern: Stroke['dashPattern']): string {
  switch (dashPattern) {
    case 'dash':
      return 'dashed';
    case 'dot':
      return 'dotted';
    case 'dash-dot':
      return 'dashed';
    default:
      return 'solid';
  }
}

function shadowsToCss(shadows: Shadow[]): string[] {
  const visible = getVisibleShadows(shadows);
  if (visible.length === 0) return [];

  const values = visible.map((s) => {
    const rgba = hexToRgba(s.color, 1);
    const color = rgbaToCssColor(rgba);
    const inset = s.type === 'inner' ? 'inset ' : '';
    return `${inset}${roundTo(s.x, 1)}px ${roundTo(s.y, 1)}px ${roundTo(s.blur, 1)}px ${roundTo(s.spread, 1)}px ${color}`;
  });

  return [`box-shadow: ${values.join(', ')};`];
}

function blursToCss(blurs: Blur[]): string[] {
  const visible = getVisibleBlurs(blurs);
  if (visible.length === 0) return [];

  const props: string[] = [];
  for (const blur of visible) {
    if (blur.type === 'layer') {
      props.push(`filter: blur(${roundTo(blur.radius, 1)}px);`);
    } else {
      props.push(`backdrop-filter: blur(${roundTo(blur.radius, 1)}px);`);
    }
  }
  return props;
}

function cornerRadiusToCss(shape: Shape): string[] {
  const radii = getEffectiveCornerRadii(shape);
  if (!radii) return [];

  const { tl, tr, br, bl } = radii;
  if (tl === tr && tr === br && br === bl) {
    return [`border-radius: ${roundTo(tl, 1)}px;`];
  }
  return [
    `border-radius: ${roundTo(tl, 1)}px ${roundTo(tr, 1)}px ${roundTo(br, 1)}px ${roundTo(bl, 1)}px;`,
  ];
}

function rectangleProperties(shape: RectangleShape): string[] {
  const props = baseDimensionProperties(shape);
  props.push(...cornerRadiusToCss(shape));
  props.push(...fillsToCss(shape.fills));
  props.push(...strokesToCss(shape.strokes));
  props.push(...shadowsToCss(shape.shadows));
  props.push(...blursToCss(shape.blurs));
  return props;
}

function ellipseProperties(shape: EllipseShape): string[] {
  const props = baseDimensionProperties(shape);
  props.push('border-radius: 50%;');
  props.push(...fillsToCss(shape.fills));
  props.push(...strokesToCss(shape.strokes));
  props.push(...shadowsToCss(shape.shadows));
  props.push(...blursToCss(shape.blurs));
  return props;
}

function frameProperties(shape: FrameShape): string[] {
  const props = baseDimensionProperties(shape);
  props.push(...cornerRadiusToCss(shape));
  props.push(...fillsToCss(shape.fills));
  props.push(...strokesToCss(shape.strokes));
  props.push(...shadowsToCss(shape.shadows));
  props.push(...blursToCss(shape.blurs));

  if (shape.clip) {
    props.push('overflow: hidden;');
  }

  if (shape.layoutMode !== 'none') {
    props.push('display: flex;');
    props.push(`flex-direction: ${shape.layoutMode === 'horizontal' ? 'row' : 'column'};`);

    if (shape.layoutWrap === 'wrap') {
      props.push('flex-wrap: wrap;');
    }

    if (shape.layoutGap > 0) {
      props.push(`gap: ${roundTo(shape.layoutGap, 1)}px;`);
    }

    if (shape.layoutWrap === 'wrap' && shape.layoutGapColumn > 0) {
      if (shape.layoutMode === 'horizontal') {
        props.push(`row-gap: ${roundTo(shape.layoutGapColumn, 1)}px;`);
      } else {
        props.push(`column-gap: ${roundTo(shape.layoutGapColumn, 1)}px;`);
      }
    }

    props.push(...paddingToCss(shape));
    props.push(`align-items: ${layoutAlignToCss(shape.layoutAlign)};`);
    props.push(`justify-content: ${layoutJustifyToCss(shape.layoutJustify)};`);
  }

  return props;
}

function paddingToCss(shape: FrameShape): string[] {
  const { paddingTop, paddingRight, paddingBottom, paddingLeft } = shape;
  if (paddingTop === 0 && paddingRight === 0 && paddingBottom === 0 && paddingLeft === 0) {
    return [];
  }
  if (
    paddingTop === paddingRight &&
    paddingRight === paddingBottom &&
    paddingBottom === paddingLeft
  ) {
    return [`padding: ${roundTo(paddingTop, 1)}px;`];
  }
  if (paddingTop === paddingBottom && paddingLeft === paddingRight) {
    return [`padding: ${roundTo(paddingTop, 1)}px ${roundTo(paddingRight, 1)}px;`];
  }
  return [
    `padding: ${roundTo(paddingTop, 1)}px ${roundTo(paddingRight, 1)}px ${roundTo(paddingBottom, 1)}px ${roundTo(paddingLeft, 1)}px;`,
  ];
}

function layoutAlignToCss(align: FrameShape['layoutAlign']): string {
  switch (align) {
    case 'start':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'stretch':
      return 'stretch';
  }
}

function layoutJustifyToCss(justify: FrameShape['layoutJustify']): string {
  switch (justify) {
    case 'start':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'space_between':
      return 'space-between';
    case 'space_around':
      return 'space-around';
  }
}

function textProperties(shape: TextShape): string[] {
  const props = baseDimensionProperties(shape);

  props.push(`font-family: '${escapeCssSingleQuotedString(shape.fontFamily)}';`);
  props.push(`font-size: ${roundTo(shape.fontSize, 1)}px;`);

  if (shape.fontWeight !== 400) {
    props.push(`font-weight: ${shape.fontWeight};`);
  }

  if (shape.fontStyle === 'italic') {
    props.push('font-style: italic;');
  }

  props.push(`line-height: ${roundTo(shape.lineHeight, 2)};`);

  if (shape.letterSpacing !== 0) {
    props.push(`letter-spacing: ${roundTo(shape.letterSpacing, 2)}px;`);
  }

  if (shape.textAlign !== 'left') {
    props.push(`text-align: ${shape.textAlign};`);
  }

  if (shape.textDecoration !== 'none') {
    const decoration = shape.textDecoration === 'strikethrough' ? 'line-through' : 'underline';
    props.push(`text-decoration: ${decoration};`);
  }

  if (shape.textTransform !== 'none') {
    props.push(`text-transform: ${shape.textTransform};`);
  }

  if (shape.textTruncation === 'ending') {
    props.push('text-overflow: ellipsis;');
    props.push('overflow: hidden;');
    props.push('white-space: nowrap;');
  }

  const visibleFills = getVisibleFills(shape.fills);
  if (visibleFills.length > 0) {
    const fill = visibleFills[0]!;
    if (fill.gradient) {
      const gradientValue = gradientToCss(fill.gradient, fill.opacity);
      props.push(`background: ${gradientValue};`);
      props.push('-webkit-background-clip: text;');
      props.push('-webkit-text-fill-color: transparent;');
    } else {
      const rgba = hexToRgba(fill.color, fill.opacity);
      props.push(`color: ${rgbaToCssColor(rgba)};`);
    }
  }

  props.push(...shadowsToCss(shape.shadows));
  props.push(...blursToCss(shape.blurs));

  return props;
}

function vectorProperties(shape: Shape): string[] {
  const props = baseDimensionProperties(shape);

  const svgPathData =
    'svgPathData' in shape ? (shape.svgPathData as string | undefined) : undefined;
  if (svgPathData) {
    props.push(`clip-path: path('${escapeCssSingleQuotedString(svgPathData)}');`);
  }

  if ('fills' in shape) {
    props.push(...fillsToCss(shape.fills as Fill[]));
  }
  if ('strokes' in shape) {
    props.push(...strokesToCss(shape.strokes as Stroke[]));
  }
  if ('shadows' in shape) {
    props.push(...shadowsToCss(shape.shadows as Shadow[]));
  }
  if ('blurs' in shape) {
    props.push(...blursToCss(shape.blurs as Blur[]));
  }

  return props;
}

function lineProperties(shape: LineShape): string[] {
  const dx = shape.x2 - shape.x1;
  const dy = shape.y2 - shape.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const props: string[] = [];
  props.push(`width: ${roundTo(length, 1)}px;`);
  props.push('height: 0;');

  if (angle !== 0 || shape.rotation !== 0) {
    const totalAngle = angle + shape.rotation;
    props.push(`transform: rotate(${roundTo(totalAngle, 2)}deg);`);
  }

  if (shape.opacity < 1) {
    props.push(`opacity: ${roundTo(shape.opacity, 2)};`);
  }

  const visible = getVisibleStrokes(shape.strokes);
  if (visible.length > 0) {
    const stroke = visible[0]!;
    const rgba = hexToRgba(stroke.color, stroke.opacity);
    const color = rgbaToCssColor(rgba);
    const style = strokeDashToCssStyle(stroke.dashPattern);
    props.push(`border-top: ${stroke.width}px ${style} ${color};`);
  }

  props.push(...shadowsToCss(shape.shadows));
  props.push(...blursToCss(shape.blurs));

  return props;
}

function imageProperties(shape: ImageShape): string[] {
  const props = baseDimensionProperties(shape);

  const fitMap: Record<ImageShape['fit'], string> = {
    fill: 'cover',
    fit: 'contain',
    crop: 'cover',
  };
  props.push(`object-fit: ${fitMap[shape.fit]};`);

  props.push(...shadowsToCss(shape.shadows));
  props.push(...blursToCss(shape.blurs));

  return props;
}
