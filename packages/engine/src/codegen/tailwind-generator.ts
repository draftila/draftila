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

export function generateTailwind(shapes: Shape[]): string {
  if (shapes.length === 0) return '';
  const tree = buildShapeTree(shapes);
  return tree.map((node) => shapeToClasses(node.shape).join(' ')).join('\n\n');
}

export function generateTailwindAllLayers(shapes: Shape[]): string {
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

    const classes = shapeToClasses(node.shape);
    if (classes.length > 0) {
      blocks.push(`${selector} {\n  @apply ${classes.join(' ')};\n}`);
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

export function shapeToClasses(shape: Shape): string[] {
  switch (shape.type) {
    case 'rectangle':
      return rectangleClasses(shape);
    case 'ellipse':
      return ellipseClasses(shape);
    case 'frame':
      return frameClasses(shape);
    case 'text':
      return textClasses(shape);
    case 'path':
      return vectorClasses(shape);
    case 'polygon':
      return vectorClasses(shape);
    case 'star':
      return vectorClasses(shape);
    case 'line':
      return lineClasses(shape);
    case 'image':
      return imageClasses(shape);
    case 'svg':
      return baseDimensionClasses(shape);
    case 'group':
      return baseDimensionClasses(shape);
  }
}

function sizingToTailwind(shape: Shape, direction: 'width' | 'height', value: number): string[] {
  const sizing = direction === 'width' ? shape.layoutSizingHorizontal : shape.layoutSizingVertical;
  const prefix = direction === 'width' ? 'w' : 'h';
  if (sizing === 'fill') return [];
  if (sizing === 'hug') return [`${prefix}-auto`];
  return [`${prefix}-[${roundTo(value, 1)}px]`];
}

function minMaxToTailwind(shape: Shape): string[] {
  const classes: string[] = [];
  if (shape.minWidth !== undefined) classes.push(`min-w-[${roundTo(shape.minWidth, 1)}px]`);
  if (shape.maxWidth !== undefined) classes.push(`max-w-[${roundTo(shape.maxWidth, 1)}px]`);
  if (shape.minHeight !== undefined) classes.push(`min-h-[${roundTo(shape.minHeight, 1)}px]`);
  if (shape.maxHeight !== undefined) classes.push(`max-h-[${roundTo(shape.maxHeight, 1)}px]`);
  return classes;
}

function baseDimensionClasses(shape: Shape): string[] {
  const classes: string[] = [];

  if (shape.layoutSizingHorizontal === 'fill') {
    classes.push('flex-1', 'self-stretch');
  }
  classes.push(...sizingToTailwind(shape, 'width', shape.width));

  if (shape.layoutSizingVertical === 'fill' && shape.layoutSizingHorizontal !== 'fill') {
    classes.push('self-stretch');
  }
  classes.push(...sizingToTailwind(shape, 'height', shape.height));

  classes.push(...minMaxToTailwind(shape));

  if (shape.rotation !== 0) {
    classes.push(`rotate-[${roundTo(shape.rotation, 2)}deg]`);
  }
  if (shape.opacity < 1) {
    classes.push(opacityToTailwind(shape.opacity));
  }
  if (shape.blendMode !== 'normal') {
    classes.push(`mix-blend-${shape.blendMode}`);
  }
  return classes;
}

function opacityToTailwind(value: number): string {
  const pct = Math.round(value * 100);
  const named = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
  if (named.includes(pct)) return `opacity-${pct}`;
  return `opacity-[${roundTo(value, 2)}]`;
}

function colorToTailwind(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  const pct = Math.round(opacity * 100);
  if (pct === Math.round(opacity * 100)) {
    return `${hex}/${pct}`;
  }
  const rgba = hexToRgba(hex, opacity);
  return rgbaToCssColor(rgba);
}

function fillsToTailwind(fills: Fill[]): string[] {
  const visible = getVisibleFills(fills);
  if (visible.length === 0) return [];

  if (visible.length === 1) {
    const fill = visible[0]!;
    return singleFillToTailwind(fill, 'bg');
  }

  const layers = visible.map(fillToCssValue).reverse();
  return [`bg-[${layers.join(',_')}]`];
}

function singleFillToTailwind(fill: Fill, prefix: string): string[] {
  if (fill.gradient) {
    return gradientToTailwind(fill.gradient, fill.opacity);
  }
  if (fill.imageSrc) {
    return [`${prefix}-[url('${fill.imageSrc}')]`];
  }
  return [`${prefix}-[${colorToTailwind(fill.color, fill.opacity)}]`];
}

function fillToCssValue(fill: Fill): string {
  if (fill.gradient) {
    return gradientToCssValue(fill.gradient, fill.opacity);
  }
  if (fill.imageSrc) {
    return `url('${fill.imageSrc}')`;
  }
  const rgba = hexToRgba(fill.color, fill.opacity);
  return rgbaToCssColor(rgba);
}

function gradientToTailwind(gradient: NonNullable<Fill['gradient']>, opacity: number): string[] {
  if (gradient.type === 'linear') {
    const dirClass = linearAngleToDirection(gradient.angle);
    if (dirClass && gradient.stops.length >= 2 && gradient.stops.length <= 3) {
      const first = gradient.stops[0]!;
      const last = gradient.stops[gradient.stops.length - 1]!;
      if (first.position === 0 && last.position === 1) {
        const classes = [
          `bg-linear-${dirClass}`,
          `from-[${colorToTailwind(first.color, opacity)}]`,
        ];
        if (gradient.stops.length === 3) {
          const mid = gradient.stops[1]!;
          classes.push(`via-[${colorToTailwind(mid.color, opacity)}]`);
        }
        classes.push(`to-[${colorToTailwind(last.color, opacity)}]`);
        return classes;
      }
    }
  }

  return [`bg-[${gradientToCssValue(gradient, opacity).replaceAll(' ', '_')}]`];
}

function linearAngleToDirection(angle: number): string | null {
  const map: Record<number, string> = {
    0: 'to-t',
    45: 'to-tr',
    90: 'to-r',
    135: 'to-br',
    180: 'to-b',
    225: 'to-bl',
    270: 'to-l',
    315: 'to-tl',
  };
  return map[Math.round(angle)] ?? null;
}

function gradientToCssValue(gradient: NonNullable<Fill['gradient']>, opacity: number): string {
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

function strokesToTailwind(strokes: Stroke[]): string[] {
  const visible = getVisibleStrokes(strokes);
  if (visible.length === 0) return [];

  const classes: string[] = [];
  const stroke = visible[0]!;
  const color = colorToTailwind(stroke.color, stroke.opacity);
  const style = strokeDashToTailwind(stroke.dashPattern);

  if (stroke.sides) {
    const sides = stroke.sides;
    if (sides.top) {
      classes.push(`border-t-[${stroke.width}px]`, `border-t-[${color}]`);
    }
    if (sides.right) {
      classes.push(`border-r-[${stroke.width}px]`, `border-r-[${color}]`);
    }
    if (sides.bottom) {
      classes.push(`border-b-[${stroke.width}px]`, `border-b-[${color}]`);
    }
    if (sides.left) {
      classes.push(`border-l-[${stroke.width}px]`, `border-l-[${color}]`);
    }
    if (style) classes.push(style);
  } else if (stroke.align === 'outside') {
    classes.push(`outline-[${stroke.width}px]`, `outline-[${color}]`, 'outline-offset-0');
    if (style) {
      classes.push(outlineStyleToTailwind(stroke.dashPattern));
    } else {
      classes.push('outline-solid');
    }
  } else {
    classes.push(`border-[${stroke.width}px]`, `border-[${color}]`);
    if (style) classes.push(style);
    if (stroke.align === 'inside') {
      classes.push('box-border');
    }
  }

  return classes;
}

function strokeDashToTailwind(dashPattern: Stroke['dashPattern']): string | null {
  switch (dashPattern) {
    case 'dash':
      return 'border-dashed';
    case 'dot':
      return 'border-dotted';
    case 'dash-dot':
      return 'border-dashed';
    default:
      return null;
  }
}

function outlineStyleToTailwind(dashPattern: Stroke['dashPattern']): string {
  switch (dashPattern) {
    case 'dash':
      return 'outline-dashed';
    case 'dot':
      return 'outline-dotted';
    case 'dash-dot':
      return 'outline-dashed';
    default:
      return 'outline-solid';
  }
}

function shadowsToTailwind(shadows: Shadow[]): string[] {
  const visible = getVisibleShadows(shadows);
  if (visible.length === 0) return [];

  const values = visible.map((s) => {
    const rgba = hexToRgba(s.color, 1);
    const color = rgbaToCssColor(rgba);
    const inset = s.type === 'inner' ? 'inset_' : '';
    return `${inset}${roundTo(s.x, 1)}px_${roundTo(s.y, 1)}px_${roundTo(s.blur, 1)}px_${roundTo(s.spread, 1)}px_${color}`;
  });

  return [`shadow-[${values.join(',_')}]`];
}

function blursToTailwind(blurs: Blur[]): string[] {
  const visible = getVisibleBlurs(blurs);
  if (visible.length === 0) return [];

  const classes: string[] = [];
  for (const blur of visible) {
    if (blur.type === 'layer') {
      classes.push(`blur-[${roundTo(blur.radius, 1)}px]`);
    } else {
      classes.push(`backdrop-blur-[${roundTo(blur.radius, 1)}px]`);
    }
  }
  return classes;
}

function cornerRadiusToTailwind(shape: Shape): string[] {
  const radii = getEffectiveCornerRadii(shape);
  if (!radii) return [];

  const { tl, tr, br, bl } = radii;
  if (tl === tr && tr === br && br === bl) {
    return [`rounded-[${roundTo(tl, 1)}px]`];
  }
  return [
    `rounded-tl-[${roundTo(tl, 1)}px]`,
    `rounded-tr-[${roundTo(tr, 1)}px]`,
    `rounded-br-[${roundTo(br, 1)}px]`,
    `rounded-bl-[${roundTo(bl, 1)}px]`,
  ];
}

function rectangleClasses(shape: RectangleShape): string[] {
  const classes = baseDimensionClasses(shape);
  classes.push(...cornerRadiusToTailwind(shape));
  classes.push(...fillsToTailwind(shape.fills));
  classes.push(...strokesToTailwind(shape.strokes));
  classes.push(...shadowsToTailwind(shape.shadows));
  classes.push(...blursToTailwind(shape.blurs));
  return classes;
}

function ellipseClasses(shape: EllipseShape): string[] {
  const classes = baseDimensionClasses(shape);
  classes.push('rounded-full');
  classes.push(...fillsToTailwind(shape.fills));
  classes.push(...strokesToTailwind(shape.strokes));
  classes.push(...shadowsToTailwind(shape.shadows));
  classes.push(...blursToTailwind(shape.blurs));
  return classes;
}

function frameClasses(shape: FrameShape): string[] {
  const classes = baseDimensionClasses(shape);
  classes.push(...cornerRadiusToTailwind(shape));
  classes.push(...fillsToTailwind(shape.fills));
  classes.push(...strokesToTailwind(shape.strokes));
  classes.push(...shadowsToTailwind(shape.shadows));
  classes.push(...blursToTailwind(shape.blurs));

  if (shape.clip) {
    classes.push('overflow-hidden');
  }

  if (shape.layoutMode !== 'none') {
    classes.push('flex');
    classes.push(shape.layoutMode === 'horizontal' ? 'flex-row' : 'flex-col');

    if (shape.layoutWrap === 'wrap') {
      classes.push('flex-wrap');
    }

    if (shape.layoutGap > 0) {
      classes.push(`gap-[${roundTo(shape.layoutGap, 1)}px]`);
    }

    if (shape.layoutWrap === 'wrap' && shape.layoutGapColumn > 0) {
      if (shape.layoutMode === 'horizontal') {
        classes.push(`gap-y-[${roundTo(shape.layoutGapColumn, 1)}px]`);
      } else {
        classes.push(`gap-x-[${roundTo(shape.layoutGapColumn, 1)}px]`);
      }
    }

    classes.push(...paddingToTailwind(shape));
    classes.push(layoutAlignToTailwind(shape.layoutAlign));
    classes.push(layoutJustifyToTailwind(shape.layoutJustify));
  }

  return classes;
}

function paddingToTailwind(shape: FrameShape): string[] {
  const { paddingTop, paddingRight, paddingBottom, paddingLeft } = shape;
  if (paddingTop === 0 && paddingRight === 0 && paddingBottom === 0 && paddingLeft === 0) {
    return [];
  }
  if (
    paddingTop === paddingRight &&
    paddingRight === paddingBottom &&
    paddingBottom === paddingLeft
  ) {
    return [`p-[${roundTo(paddingTop, 1)}px]`];
  }
  if (paddingTop === paddingBottom && paddingLeft === paddingRight) {
    return [`px-[${roundTo(paddingRight, 1)}px]`, `py-[${roundTo(paddingTop, 1)}px]`];
  }
  return [
    `pt-[${roundTo(paddingTop, 1)}px]`,
    `pr-[${roundTo(paddingRight, 1)}px]`,
    `pb-[${roundTo(paddingBottom, 1)}px]`,
    `pl-[${roundTo(paddingLeft, 1)}px]`,
  ];
}

function layoutAlignToTailwind(align: FrameShape['layoutAlign']): string {
  switch (align) {
    case 'start':
      return 'items-start';
    case 'center':
      return 'items-center';
    case 'end':
      return 'items-end';
    case 'stretch':
      return 'items-stretch';
  }
}

function layoutJustifyToTailwind(justify: FrameShape['layoutJustify']): string {
  switch (justify) {
    case 'start':
      return 'justify-start';
    case 'center':
      return 'justify-center';
    case 'end':
      return 'justify-end';
    case 'space_between':
      return 'justify-between';
    case 'space_around':
      return 'justify-around';
  }
}

const FONT_WEIGHT_MAP: Record<number, string> = {
  100: 'font-thin',
  200: 'font-extralight',
  300: 'font-light',
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
  800: 'font-extrabold',
  900: 'font-black',
};

function textClasses(shape: TextShape): string[] {
  const classes = baseDimensionClasses(shape);

  classes.push(`font-['${shape.fontFamily.replaceAll(' ', '_')}']`);
  classes.push(`text-[${roundTo(shape.fontSize, 1)}px]`);

  if (shape.fontWeight !== 400) {
    classes.push(FONT_WEIGHT_MAP[shape.fontWeight] ?? `font-[${shape.fontWeight}]`);
  }

  if (shape.fontStyle === 'italic') {
    classes.push('italic');
  }

  classes.push(`leading-[${roundTo(shape.lineHeight, 2)}]`);

  if (shape.letterSpacing !== 0) {
    classes.push(`tracking-[${roundTo(shape.letterSpacing, 2)}px]`);
  }

  if (shape.textAlign !== 'left') {
    classes.push(`text-${shape.textAlign}`);
  }

  if (shape.textDecoration !== 'none') {
    classes.push(shape.textDecoration === 'strikethrough' ? 'line-through' : 'underline');
  }

  if (shape.textTransform !== 'none') {
    classes.push(shape.textTransform);
  }

  if (shape.textTruncation === 'ending') {
    classes.push('truncate');
  }

  const visibleFills = getVisibleFills(shape.fills);
  if (visibleFills.length > 0) {
    const fill = visibleFills[0]!;
    if (fill.gradient) {
      classes.push(...gradientToTailwind(fill.gradient, fill.opacity));
      classes.push('bg-clip-text', 'text-transparent');
    } else {
      classes.push(`text-[${colorToTailwind(fill.color, fill.opacity)}]`);
    }
  }

  classes.push(...shadowsToTailwind(shape.shadows));
  classes.push(...blursToTailwind(shape.blurs));

  return classes;
}

function vectorClasses(shape: Shape): string[] {
  const classes = baseDimensionClasses(shape);

  const svgPathData =
    'svgPathData' in shape ? (shape.svgPathData as string | undefined) : undefined;
  if (svgPathData) {
    classes.push(`[clip-path:path('${svgPathData}')]`);
  }

  if ('fills' in shape) {
    classes.push(...fillsToTailwind(shape.fills as Fill[]));
  }
  if ('strokes' in shape) {
    classes.push(...strokesToTailwind(shape.strokes as Stroke[]));
  }
  if ('shadows' in shape) {
    classes.push(...shadowsToTailwind(shape.shadows as Shadow[]));
  }
  if ('blurs' in shape) {
    classes.push(...blursToTailwind(shape.blurs as Blur[]));
  }

  return classes;
}

function lineClasses(shape: LineShape): string[] {
  const dx = shape.x2 - shape.x1;
  const dy = shape.y2 - shape.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const classes: string[] = [];
  classes.push(`w-[${roundTo(length, 1)}px]`);
  classes.push('h-0');

  if (angle !== 0 || shape.rotation !== 0) {
    const totalAngle = angle + shape.rotation;
    classes.push(`rotate-[${roundTo(totalAngle, 2)}deg]`);
  }

  if (shape.opacity < 1) {
    classes.push(opacityToTailwind(shape.opacity));
  }

  const visible = getVisibleStrokes(shape.strokes);
  if (visible.length > 0) {
    const stroke = visible[0]!;
    const color = colorToTailwind(stroke.color, stroke.opacity);
    const style = strokeDashToTailwind(stroke.dashPattern);
    classes.push(`border-t-[${stroke.width}px]`, `border-t-[${color}]`);
    if (style) classes.push(style);
  }

  classes.push(...shadowsToTailwind(shape.shadows));
  classes.push(...blursToTailwind(shape.blurs));

  return classes;
}

function imageClasses(shape: ImageShape): string[] {
  const classes = baseDimensionClasses(shape);

  const fitMap: Record<ImageShape['fit'], string> = {
    fill: 'object-cover',
    fit: 'object-contain',
    crop: 'object-cover',
  };
  classes.push(fitMap[shape.fit]);

  classes.push(...shadowsToTailwind(shape.shadows));
  classes.push(...blursToTailwind(shape.blurs));

  return classes;
}
