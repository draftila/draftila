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
  roundTo,
  getVisibleFills,
  getVisibleStrokes,
  getVisibleShadows,
  getVisibleBlurs,
  getEffectiveCornerRadii,
  buildShapeTree,
  indent,
} from './helpers';

function frameModifier(shape: Shape): string {
  const hSizing = shape.layoutSizingHorizontal;
  const vSizing = shape.layoutSizingVertical;

  const parts: string[] = [];
  if (hSizing === 'fill') {
    parts.push('maxWidth: .infinity');
  } else if (hSizing === 'hug') {
    // hug = no fixed width, let content size it
  } else {
    parts.push(`width: ${roundTo(shape.width, 1)}`);
  }
  if (vSizing === 'fill') {
    parts.push('maxHeight: .infinity');
  } else if (vSizing === 'hug') {
    // hug = no fixed height, let content size it
  } else {
    parts.push(`height: ${roundTo(shape.height, 1)}`);
  }

  if (shape.minWidth !== undefined) parts.push(`minWidth: ${roundTo(shape.minWidth, 1)}`);
  if (shape.maxWidth !== undefined && hSizing !== 'fill')
    parts.push(`maxWidth: ${roundTo(shape.maxWidth, 1)}`);
  if (shape.minHeight !== undefined) parts.push(`minHeight: ${roundTo(shape.minHeight, 1)}`);
  if (shape.maxHeight !== undefined && vSizing !== 'fill')
    parts.push(`maxHeight: ${roundTo(shape.maxHeight, 1)}`);

  if (parts.length === 0) return '';
  return `.frame(${parts.join(', ')})`;
}

export function generateSwiftUI(shapes: Shape[]): string {
  if (shapes.length === 0) return '';
  const tree = buildShapeTree(shapes);

  if (tree.length === 1) {
    return nodeToSwiftUI(tree[0]!, 0);
  }

  const children = tree.map((node) => nodeToSwiftUI(node, 1)).join('\n');
  return `ZStack {\n${children}\n}`;
}

function nodeToSwiftUI(node: ShapeTreeNode, level: number): string {
  const code = shapeToSwiftUI(node);
  return indent(code, level);
}

function shapeToSwiftUI(node: ShapeTreeNode): string {
  switch (node.shape.type) {
    case 'rectangle':
      return rectangleToSwiftUI(node.shape);
    case 'ellipse':
      return ellipseToSwiftUI(node.shape);
    case 'frame':
      return frameToSwiftUI(node.shape, node.children);
    case 'text':
      return textToSwiftUI(node.shape);
    case 'path':
    case 'polygon':
    case 'star':
      return vectorToSwiftUI(node.shape);
    case 'line':
      return lineToSwiftUI(node.shape);
    case 'image':
      return imageToSwiftUI(node.shape);
    case 'svg':
      return boxWithModifiers(node.shape, []);
    case 'group':
      return groupToSwiftUI(node);
  }
}

function rgbaToSwiftUIColor(r: number, g: number, b: number, a: number): string {
  const rf = roundTo(r / 255, 3);
  const gf = roundTo(g / 255, 3);
  const bf = roundTo(b / 255, 3);
  if (a < 1) {
    return `Color(red: ${rf}, green: ${gf}, blue: ${bf}).opacity(${roundTo(a, 3)})`;
  }
  return `Color(red: ${rf}, green: ${gf}, blue: ${bf})`;
}

function escapeSwiftStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function fillToSwiftUI(fill: Fill): string {
  if (fill.gradient) {
    return gradientToSwiftUI(fill.gradient, fill.opacity);
  }
  const rgba = hexToRgba(fill.color, fill.opacity);
  return rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
}

function gradientToSwiftUI(gradient: NonNullable<Fill['gradient']>, opacity: number): string {
  const colors = gradient.stops
    .map((s) => {
      const rgba = hexToRgba(s.color, opacity);
      return rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
    })
    .join(', ');

  if (gradient.type === 'linear') {
    const angle = gradient.angle ?? 0;
    const { start, end } = angleToSwiftUIPoints(angle);
    return `LinearGradient(colors: [${colors}], startPoint: ${start}, endPoint: ${end})`;
  }

  return `RadialGradient(colors: [${colors}], center: .center, startRadius: 0, endRadius: ${roundTo((gradient.r ?? 0.5) * 100, 1)})`;
}

function angleToSwiftUIPoints(angle: number): { start: string; end: string } {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 0) return { start: '.top', end: '.bottom' };
  if (normalized === 90) return { start: '.leading', end: '.trailing' };
  if (normalized === 180) return { start: '.bottom', end: '.top' };
  if (normalized === 270) return { start: '.trailing', end: '.leading' };

  const rad = (normalized * Math.PI) / 180;
  const x = roundTo(Math.sin(rad) * 0.5 + 0.5, 3);
  const y = roundTo(-Math.cos(rad) * 0.5 + 0.5, 3);
  const ex = roundTo(1 - x, 3);
  const ey = roundTo(1 - y, 3);
  return {
    start: `UnitPoint(x: ${x}, y: ${y})`,
    end: `UnitPoint(x: ${ex}, y: ${ey})`,
  };
}

function shapePath(shape: Shape): string | null {
  const radii = getEffectiveCornerRadii(shape);
  if (!radii) return null;

  const { tl, tr, br, bl } = radii;
  if (tl === tr && tr === br && br === bl) {
    return `RoundedRectangle(cornerRadius: ${roundTo(tl, 1)})`;
  }
  return `UnevenRoundedRectangle(topLeadingRadius: ${roundTo(tl, 1)}, bottomLeadingRadius: ${roundTo(bl, 1)}, bottomTrailingRadius: ${roundTo(br, 1)}, topTrailingRadius: ${roundTo(tr, 1)})`;
}

function buildModifiers(shape: Shape, extras: string[]): string[] {
  const modifiers: string[] = [...extras];

  const fills = 'fills' in shape ? getVisibleFills(shape.fills as Fill[]) : [];
  for (const fill of fills) {
    modifiers.push(`.background(${fillToSwiftUI(fill)})`);
  }

  const path = shapePath(shape);
  if (path) {
    modifiers.push(`.clipShape(${path})`);
  }

  const strokes = 'strokes' in shape ? getVisibleStrokes(shape.strokes as Stroke[]) : [];
  for (const stroke of strokes) {
    const rgba = hexToRgba(stroke.color, stroke.opacity);
    const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
    const overlay = path
      ? `${path}.stroke(${color}, lineWidth: ${stroke.width})`
      : `Rectangle().stroke(${color}, lineWidth: ${stroke.width})`;
    modifiers.push(`.overlay(${overlay})`);
  }

  const shadows = 'shadows' in shape ? getVisibleShadows(shape.shadows as Shadow[]) : [];
  for (const shadow of shadows) {
    if (shadow.type === 'drop') {
      const rgba = hexToRgba(shadow.color, 1);
      const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
      modifiers.push(
        `.shadow(color: ${color}, radius: ${roundTo(shadow.blur / 2, 1)}, x: ${roundTo(shadow.x, 1)}, y: ${roundTo(shadow.y, 1)})`,
      );
    }
  }

  const blurs = 'blurs' in shape ? getVisibleBlurs(shape.blurs as Blur[]) : [];
  for (const blur of blurs) {
    if (blur.type === 'layer') {
      modifiers.push(`.blur(radius: ${roundTo(blur.radius, 1)})`);
    }
  }

  const frame = frameModifier(shape);
  if (frame) modifiers.push(frame);

  if (shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(shape.opacity, 2)})`);
  }

  if (shape.rotation !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(shape.rotation, 2)}))`);
  }

  if (shape.blendMode !== 'normal') {
    modifiers.push(`.blendMode(.${blendModeToSwiftUI(shape.blendMode)})`);
  }

  return modifiers;
}

function blendModeToSwiftUI(mode: string): string {
  const map: Record<string, string> = {
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'colorDodge',
    'color-burn': 'colorBurn',
    'hard-light': 'hardLight',
    'soft-light': 'softLight',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity',
  };
  return map[mode] ?? 'normal';
}

function boxWithModifiers(shape: Shape, extraModifiers: string[]): string {
  const modifiers = buildModifiers(shape, extraModifiers);
  if (modifiers.length === 0) return 'Rectangle()';

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `Rectangle()\n${lines}`;
}

function rectangleToSwiftUI(shape: RectangleShape): string {
  const radii = getEffectiveCornerRadii(shape);
  let base: string;
  if (radii) {
    const { tl, tr, br, bl } = radii;
    if (tl === tr && tr === br && br === bl) {
      base = `RoundedRectangle(cornerRadius: ${roundTo(tl, 1)})`;
    } else {
      base = `UnevenRoundedRectangle(topLeadingRadius: ${roundTo(tl, 1)}, bottomLeadingRadius: ${roundTo(bl, 1)}, bottomTrailingRadius: ${roundTo(br, 1)}, topTrailingRadius: ${roundTo(tr, 1)})`;
    }
  } else {
    base = 'Rectangle()';
  }

  const modifiers = buildModifiersWithoutClipShape(shape);
  if (modifiers.length === 0) return base;

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `${base}\n${lines}`;
}

function buildModifiersWithoutClipShape(shape: Shape): string[] {
  const modifiers: string[] = [];

  const fills = 'fills' in shape ? getVisibleFills(shape.fills as Fill[]) : [];
  if (fills.length > 0) {
    modifiers.push(`.fill(${fillToSwiftUI(fills[0]!)})`);
    for (let i = 1; i < fills.length; i++) {
      modifiers.push(`.background(${fillToSwiftUI(fills[i]!)})`);
    }
  }

  const strokes = 'strokes' in shape ? getVisibleStrokes(shape.strokes as Stroke[]) : [];
  for (const stroke of strokes) {
    const rgba = hexToRgba(stroke.color, stroke.opacity);
    const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
    modifiers.push(`.stroke(${color}, lineWidth: ${stroke.width})`);
  }

  const shadows = 'shadows' in shape ? getVisibleShadows(shape.shadows as Shadow[]) : [];
  for (const shadow of shadows) {
    if (shadow.type === 'drop') {
      const rgba = hexToRgba(shadow.color, 1);
      const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
      modifiers.push(
        `.shadow(color: ${color}, radius: ${roundTo(shadow.blur / 2, 1)}, x: ${roundTo(shadow.x, 1)}, y: ${roundTo(shadow.y, 1)})`,
      );
    }
  }

  const blurs = 'blurs' in shape ? getVisibleBlurs(shape.blurs as Blur[]) : [];
  for (const blur of blurs) {
    if (blur.type === 'layer') {
      modifiers.push(`.blur(radius: ${roundTo(blur.radius, 1)})`);
    }
  }

  const frame = frameModifier(shape);
  if (frame) modifiers.push(frame);

  if (shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(shape.opacity, 2)})`);
  }

  if (shape.rotation !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(shape.rotation, 2)}))`);
  }

  if (shape.blendMode !== 'normal') {
    modifiers.push(`.blendMode(.${blendModeToSwiftUI(shape.blendMode)})`);
  }

  return modifiers;
}

function ellipseToSwiftUI(shape: EllipseShape): string {
  const modifiers = buildModifiersWithoutClipShape(shape);
  if (modifiers.length === 0) return 'Ellipse()';

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `Ellipse()\n${lines}`;
}

function frameToSwiftUI(shape: FrameShape, children: ShapeTreeNode[]): string {
  const childCode = children
    .filter((c) => c.shape.visible)
    .map((c) => nodeToSwiftUI(c, 1))
    .join('\n');

  let container: string;
  if (shape.layoutMode === 'horizontal') {
    const alignment = crossAxisAlignment(shape.layoutAlign, 'h');
    const spacing = shape.layoutGap > 0 ? `, spacing: ${roundTo(shape.layoutGap, 1)}` : '';
    container = `HStack(alignment: ${alignment}${spacing})`;
  } else if (shape.layoutMode === 'vertical') {
    const alignment = crossAxisAlignment(shape.layoutAlign, 'v');
    const spacing = shape.layoutGap > 0 ? `, spacing: ${roundTo(shape.layoutGap, 1)}` : '';
    container = `VStack(alignment: ${alignment}${spacing})`;
  } else {
    container = 'ZStack';
  }

  const body = childCode ? `${container} {\n${childCode}\n}` : `${container} {}`;

  const modifiers: string[] = [];

  const fills = getVisibleFills(shape.fills);
  for (const fill of fills) {
    modifiers.push(`.background(${fillToSwiftUI(fill)})`);
  }

  const path = shapePath(shape);
  if (path) {
    modifiers.push(`.clipShape(${path})`);
  }

  const strokes = getVisibleStrokes(shape.strokes);
  for (const stroke of strokes) {
    const rgba = hexToRgba(stroke.color, stroke.opacity);
    const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
    const overlay = path
      ? `${path}.stroke(${color}, lineWidth: ${stroke.width})`
      : `Rectangle().stroke(${color}, lineWidth: ${stroke.width})`;
    modifiers.push(`.overlay(${overlay})`);
  }

  const shadows = getVisibleShadows(shape.shadows);
  for (const shadow of shadows) {
    if (shadow.type === 'drop') {
      const rgba = hexToRgba(shadow.color, 1);
      const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
      modifiers.push(
        `.shadow(color: ${color}, radius: ${roundTo(shadow.blur / 2, 1)}, x: ${roundTo(shadow.x, 1)}, y: ${roundTo(shadow.y, 1)})`,
      );
    }
  }

  const blurs = getVisibleBlurs(shape.blurs);
  for (const blur of blurs) {
    if (blur.type === 'layer') {
      modifiers.push(`.blur(radius: ${roundTo(blur.radius, 1)})`);
    }
  }

  if (shape.clip) {
    modifiers.push('.clipped()');
  }

  const hasPadding =
    shape.paddingTop > 0 ||
    shape.paddingRight > 0 ||
    shape.paddingBottom > 0 ||
    shape.paddingLeft > 0;
  if (hasPadding) {
    if (
      shape.paddingTop === shape.paddingRight &&
      shape.paddingRight === shape.paddingBottom &&
      shape.paddingBottom === shape.paddingLeft
    ) {
      modifiers.push(`.padding(${roundTo(shape.paddingTop, 1)})`);
    } else {
      modifiers.push(
        `.padding(EdgeInsets(top: ${roundTo(shape.paddingTop, 1)}, leading: ${roundTo(shape.paddingLeft, 1)}, bottom: ${roundTo(shape.paddingBottom, 1)}, trailing: ${roundTo(shape.paddingRight, 1)}))`,
      );
    }
  }

  const frame = frameModifier(shape);
  if (frame) modifiers.push(frame);

  if (shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(shape.opacity, 2)})`);
  }

  if (shape.rotation !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(shape.rotation, 2)}))`);
  }

  if (shape.blendMode !== 'normal') {
    modifiers.push(`.blendMode(.${blendModeToSwiftUI(shape.blendMode)})`);
  }

  if (modifiers.length === 0) return body;

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `${body}\n${lines}`;
}

function crossAxisAlignment(align: FrameShape['layoutAlign'], direction: 'h' | 'v'): string {
  if (direction === 'h') {
    switch (align) {
      case 'start':
        return '.top';
      case 'center':
        return '.center';
      case 'end':
        return '.bottom';
      case 'stretch':
        return '.center';
    }
  }
  switch (align) {
    case 'start':
      return '.leading';
    case 'center':
      return '.center';
    case 'end':
      return '.trailing';
    case 'stretch':
      return '.center';
  }
}

function textToSwiftUI(shape: TextShape): string {
  const content = escapeSwiftStringLiteral(shape.content);
  let code = `Text("${content}")`;
  const modifiers: string[] = [];

  const weightMap: Record<number, string> = {
    100: '.ultraLight',
    200: '.thin',
    300: '.light',
    400: '.regular',
    500: '.medium',
    600: '.semibold',
    700: '.bold',
    800: '.heavy',
    900: '.black',
  };
  const weight = weightMap[shape.fontWeight] ?? `.init(CGFloat(${shape.fontWeight}))`;

  if (shape.fontFamily === 'Inter' || shape.fontFamily === 'system') {
    modifiers.push(`.font(.system(size: ${roundTo(shape.fontSize, 1)}, weight: ${weight}))`);
  } else {
    modifiers.push(
      `.font(.custom("${escapeSwiftStringLiteral(shape.fontFamily)}", size: ${roundTo(shape.fontSize, 1)}))`,
    );
    if (shape.fontWeight !== 400) {
      modifiers.push(`.fontWeight(${weight})`);
    }
  }

  if (shape.fontStyle === 'italic') {
    modifiers.push('.italic()');
  }

  const fills = getVisibleFills(shape.fills);
  if (fills.length > 0) {
    const fill = fills[0]!;
    if (fill.gradient) {
      modifiers.push(`.foregroundStyle(${gradientToSwiftUI(fill.gradient, fill.opacity)})`);
    } else {
      const rgba = hexToRgba(fill.color, fill.opacity);
      modifiers.push(`.foregroundColor(${rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a)})`);
    }
  }

  if (shape.lineHeight !== 1.2) {
    modifiers.push(`.lineSpacing(${roundTo((shape.lineHeight - 1) * shape.fontSize, 1)})`);
  }

  if (shape.letterSpacing !== 0) {
    modifiers.push(`.tracking(${roundTo(shape.letterSpacing, 2)})`);
  }

  if (shape.textAlign !== 'left') {
    const alignMap: Record<string, string> = {
      center: '.center',
      right: '.trailing',
    };
    modifiers.push(`.multilineTextAlignment(${alignMap[shape.textAlign] ?? '.leading'})`);
  }

  if (shape.textDecoration === 'underline') {
    modifiers.push('.underline()');
  } else if (shape.textDecoration === 'strikethrough') {
    modifiers.push('.strikethrough()');
  }

  if (shape.textTruncation === 'ending') {
    modifiers.push('.lineLimit(1)');
    modifiers.push('.truncationMode(.tail)');
  }

  modifiers.push(`.frame(width: ${roundTo(shape.width, 1)}, height: ${roundTo(shape.height, 1)})`);

  if (shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(shape.opacity, 2)})`);
  }

  if (shape.rotation !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(shape.rotation, 2)}))`);
  }

  const shadows = getVisibleShadows(shape.shadows);
  for (const shadow of shadows) {
    if (shadow.type === 'drop') {
      const rgba = hexToRgba(shadow.color, 1);
      const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
      modifiers.push(
        `.shadow(color: ${color}, radius: ${roundTo(shadow.blur / 2, 1)}, x: ${roundTo(shadow.x, 1)}, y: ${roundTo(shadow.y, 1)})`,
      );
    }
  }

  if (modifiers.length === 0) return code;

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `${code}\n${lines}`;
}

function vectorToSwiftUI(shape: Shape): string {
  const svgPathData =
    'svgPathData' in shape ? (shape.svgPathData as string | undefined) : undefined;

  if (svgPathData) {
    const modifiers = buildModifiersWithoutClipShape(shape);
    const lines = modifiers.map((m) => `  ${m}`).join('\n');
    const pathView = `Path { path in\n  path.addPath(Path("${escapeSwiftStringLiteral(svgPathData)}"))\n}`;
    return lines ? `${pathView}\n${lines}` : pathView;
  }

  return boxWithModifiers(shape, []);
}

function lineToSwiftUI(shape: LineShape): string {
  const dx = shape.x2 - shape.x1;
  const dy = shape.y2 - shape.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const modifiers: string[] = [];

  const strokes = getVisibleStrokes(shape.strokes);
  if (strokes.length > 0) {
    const stroke = strokes[0]!;
    const rgba = hexToRgba(stroke.color, stroke.opacity);
    const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
    modifiers.push(`.stroke(${color}, lineWidth: ${stroke.width})`);
  }

  modifiers.push(`.frame(width: ${roundTo(length, 1)}, height: 1)`);

  const totalAngle = angle + shape.rotation;
  if (totalAngle !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(totalAngle, 2)}))`);
  }

  if (shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(shape.opacity, 2)})`);
  }

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  const base =
    'Path { path in\n  path.move(to: CGPoint(x: 0, y: 0.5))\n  path.addLine(to: CGPoint(x: 1, y: 0.5))\n}';
  return lines ? `${base}\n${lines}` : base;
}

function imageToSwiftUI(shape: ImageShape): string {
  const fitMap: Record<ImageShape['fit'], string> = {
    fill: '.scaledToFill()',
    fit: '.scaledToFit()',
    crop: '.scaledToFill()',
  };

  const modifiers: string[] = [];
  modifiers.push('.resizable()');
  modifiers.push(fitMap[shape.fit]);
  modifiers.push(`.frame(width: ${roundTo(shape.width, 1)}, height: ${roundTo(shape.height, 1)})`);

  if (shape.fit === 'crop' || shape.fit === 'fill') {
    modifiers.push('.clipped()');
  }

  if (shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(shape.opacity, 2)})`);
  }

  if (shape.rotation !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(shape.rotation, 2)}))`);
  }

  const shadows = getVisibleShadows(shape.shadows);
  for (const shadow of shadows) {
    if (shadow.type === 'drop') {
      const rgba = hexToRgba(shadow.color, 1);
      const color = rgbaToSwiftUIColor(rgba.r, rgba.g, rgba.b, rgba.a);
      modifiers.push(
        `.shadow(color: ${color}, radius: ${roundTo(shadow.blur / 2, 1)}, x: ${roundTo(shadow.x, 1)}, y: ${roundTo(shadow.y, 1)})`,
      );
    }
  }

  const src = escapeSwiftStringLiteral(shape.src || 'placeholder');
  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `Image("${src}")\n${lines}`;
}

function groupToSwiftUI(node: ShapeTreeNode): string {
  const children = node.children
    .filter((c) => c.shape.visible)
    .map((c) => nodeToSwiftUI(c, 1))
    .join('\n');

  const modifiers: string[] = [];
  if (node.shape.opacity < 1) {
    modifiers.push(`.opacity(${roundTo(node.shape.opacity, 2)})`);
  }
  if (node.shape.rotation !== 0) {
    modifiers.push(`.rotationEffect(.degrees(${roundTo(node.shape.rotation, 2)}))`);
  }

  const body = children ? `ZStack {\n${children}\n}` : 'ZStack {}';
  if (modifiers.length === 0) return body;

  const lines = modifiers.map((m) => `  ${m}`).join('\n');
  return `${body}\n${lines}`;
}
