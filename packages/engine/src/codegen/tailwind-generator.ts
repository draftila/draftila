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
  gradientToCssValue,
} from './helpers';

function spacingClass(prefix: string, px: number): string {
  const rounded = roundTo(px, 1);
  if (rounded === 0) return `${prefix}-0`;
  if (rounded % 1 === 0 && rounded % 4 === 0) return `${prefix}-${rounded / 4}`;
  if (rounded === 1) return `${prefix}-px`;
  if (rounded === 2) return `${prefix}-0.5`;
  if (rounded === 6) return `${prefix}-1.5`;
  if (rounded === 10) return `${prefix}-2.5`;
  if (rounded === 14) return `${prefix}-3.5`;
  return `${prefix}-[${rounded}px]`;
}

const FONT_SIZE_MAP: Record<number, string> = {
  12: 'text-xs',
  14: 'text-sm',
  16: 'text-base',
  18: 'text-lg',
  20: 'text-xl',
  24: 'text-2xl',
  30: 'text-3xl',
  36: 'text-4xl',
  48: 'text-5xl',
  60: 'text-6xl',
  72: 'text-7xl',
  96: 'text-8xl',
  128: 'text-9xl',
};

function fontSizeClass(px: number): string {
  return FONT_SIZE_MAP[px] ?? `text-[${roundTo(px, 1)}px]`;
}

const BORDER_RADIUS_MAP: Record<number, string> = {
  2: 'rounded-sm',
  4: 'rounded',
  6: 'rounded-md',
  8: 'rounded-lg',
  12: 'rounded-xl',
  16: 'rounded-2xl',
  24: 'rounded-3xl',
};

function radiusClass(prefix: string, px: number): string {
  if (prefix === 'rounded') {
    return BORDER_RADIUS_MAP[px] ?? `rounded-[${roundTo(px, 1)}px]`;
  }
  const mapped = BORDER_RADIUS_MAP[px];
  if (mapped) {
    const suffix = mapped.replace('rounded', '');
    return `${prefix}${suffix || ''}`;
  }
  return `${prefix}-[${roundTo(px, 1)}px]`;
}

const BORDER_WIDTH_MAP: Record<number, string> = {
  0: '0',
  1: '',
  2: '2',
  4: '4',
  8: '8',
};

function borderWidthClass(prefix: string, px: number): string {
  const mapped = BORDER_WIDTH_MAP[px];
  if (mapped !== undefined) {
    return mapped === '' ? prefix : `${prefix}-${mapped}`;
  }
  return `${prefix}-[${px}px]`;
}

const BLUR_MAP: Record<number, string> = {
  0: 'blur-none',
  4: 'blur-xs',
  8: 'blur-sm',
  12: 'blur-md',
  16: 'blur-lg',
  24: 'blur-xl',
  40: 'blur-2xl',
  64: 'blur-3xl',
};

const BACKDROP_BLUR_MAP: Record<number, string> = {
  0: 'backdrop-blur-none',
  4: 'backdrop-blur-xs',
  8: 'backdrop-blur-sm',
  12: 'backdrop-blur-md',
  16: 'backdrop-blur-lg',
  24: 'backdrop-blur-xl',
  40: 'backdrop-blur-2xl',
  64: 'backdrop-blur-3xl',
};

const LEADING_MAP: Record<number, string> = {
  1: 'leading-none',
  1.25: 'leading-tight',
  1.375: 'leading-snug',
  1.5: 'leading-normal',
  1.625: 'leading-relaxed',
  2: 'leading-loose',
};

function leadingClass(value: number): string {
  return LEADING_MAP[value] ?? `leading-[${roundTo(value, 2)}]`;
}

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
  return [spacingClass(prefix, value)];
}

function minMaxToTailwind(shape: Shape): string[] {
  const classes: string[] = [];
  if (shape.minWidth !== undefined) classes.push(spacingClass('min-w', shape.minWidth));
  if (shape.maxWidth !== undefined) classes.push(spacingClass('max-w', shape.maxWidth));
  if (shape.minHeight !== undefined) classes.push(spacingClass('min-h', shape.minHeight));
  if (shape.maxHeight !== undefined) classes.push(spacingClass('max-h', shape.maxHeight));
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
  return [`bg-[${layers.map((l) => l.replaceAll(' ', '_')).join(',_')}]`];
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

function gradientStopsToArbitrary(
  stops: NonNullable<Fill['gradient']>['stops'],
  opacity: number,
): string {
  return stops
    .map((s) => {
      const rgba = hexToRgba(s.color, opacity);
      const color = rgbaToCssColor(rgba).replaceAll(' ', '_');
      return `${color}_${roundTo(s.position * 100, 1)}%`;
    })
    .join(',');
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

  if (gradient.type === 'linear') {
    const stops = gradientStopsToArbitrary(gradient.stops, opacity);
    const cssAngle = gradient.angle + 90;
    return [`bg-linear-[${roundTo(cssAngle, 1)}deg,${stops}]`];
  }

  const stops = gradientStopsToArbitrary(gradient.stops, opacity);
  const cx = roundTo((gradient.cx ?? 0.5) * 100, 1);
  const cy = roundTo((gradient.cy ?? 0.5) * 100, 1);
  return [`bg-[radial-gradient(circle_at_${cx}%_${cy}%,${stops})]`];
}

function linearAngleToDirection(angle: number): string | null {
  const cssAngle = (((Math.round(angle) + 90) % 360) + 360) % 360;
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
  return map[cssAngle] ?? null;
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
      classes.push(borderWidthClass('border-t', stroke.width), `border-t-[${color}]`);
    }
    if (sides.right) {
      classes.push(borderWidthClass('border-r', stroke.width), `border-r-[${color}]`);
    }
    if (sides.bottom) {
      classes.push(borderWidthClass('border-b', stroke.width), `border-b-[${color}]`);
    }
    if (sides.left) {
      classes.push(borderWidthClass('border-l', stroke.width), `border-l-[${color}]`);
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
    classes.push(borderWidthClass('border', stroke.width), `border-[${color}]`);
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
      classes.push(BLUR_MAP[blur.radius] ?? `blur-[${roundTo(blur.radius, 1)}px]`);
    } else {
      classes.push(
        BACKDROP_BLUR_MAP[blur.radius] ?? `backdrop-blur-[${roundTo(blur.radius, 1)}px]`,
      );
    }
  }
  return classes;
}

function cornerRadiusToTailwind(shape: Shape): string[] {
  const radii = getEffectiveCornerRadii(shape);
  if (!radii) return [];

  const { tl, tr, br, bl } = radii;
  if (tl === tr && tr === br && br === bl) {
    return [radiusClass('rounded', tl)];
  }
  return [
    radiusClass('rounded-tl', tl),
    radiusClass('rounded-tr', tr),
    radiusClass('rounded-br', br),
    radiusClass('rounded-bl', bl),
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
      classes.push(spacingClass('gap', shape.layoutGap));
    }

    if (shape.layoutWrap === 'wrap' && shape.layoutGapColumn > 0) {
      if (shape.layoutMode === 'horizontal') {
        classes.push(spacingClass('gap-y', shape.layoutGapColumn));
      } else {
        classes.push(spacingClass('gap-x', shape.layoutGapColumn));
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
    return [spacingClass('p', paddingTop)];
  }
  if (paddingTop === paddingBottom && paddingLeft === paddingRight) {
    return [spacingClass('px', paddingRight), spacingClass('py', paddingTop)];
  }
  return [
    spacingClass('pt', paddingTop),
    spacingClass('pr', paddingRight),
    spacingClass('pb', paddingBottom),
    spacingClass('pl', paddingLeft),
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
  classes.push(fontSizeClass(shape.fontSize));

  if (shape.fontWeight !== 400) {
    classes.push(FONT_WEIGHT_MAP[shape.fontWeight] ?? `font-[${shape.fontWeight}]`);
  }

  if (shape.fontStyle === 'italic') {
    classes.push('italic');
  }

  classes.push(leadingClass(shape.lineHeight));

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
