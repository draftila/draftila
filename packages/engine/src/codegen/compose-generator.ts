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

export function generateCompose(shapes: Shape[]): string {
  if (shapes.length === 0) return '';
  const tree = buildShapeTree(shapes);

  if (tree.length === 1) {
    return nodeToCompose(tree[0]!, 0);
  }

  const children = tree.map((node) => nodeToCompose(node, 1)).join('\n');
  return `Box {\n${children}\n}`;
}

function nodeToCompose(node: ShapeTreeNode, level: number): string {
  const code = shapeToCompose(node);
  return indent(code, level);
}

function shapeToCompose(node: ShapeTreeNode): string {
  switch (node.shape.type) {
    case 'rectangle':
      return rectangleToCompose(node.shape);
    case 'ellipse':
      return ellipseToCompose(node.shape);
    case 'frame':
      return frameToCompose(node.shape, node.children);
    case 'text':
      return textToCompose(node.shape);
    case 'path':
    case 'polygon':
    case 'star':
      return vectorToCompose(node.shape);
    case 'line':
      return lineToCompose(node.shape);
    case 'image':
      return imageToCompose(node.shape);
    case 'svg':
      return boxWithModifier(node.shape);
    case 'group':
      return groupToCompose(node);
  }
}

function hexToComposeColor(hex: string, opacity: number): string {
  const rgba = hexToRgba(hex, opacity);
  const r = rgba.r.toString(16).padStart(2, '0').toUpperCase();
  const g = rgba.g.toString(16).padStart(2, '0').toUpperCase();
  const b = rgba.b.toString(16).padStart(2, '0').toUpperCase();

  if (rgba.a < 1) {
    const a = Math.round(rgba.a * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    return `Color(0x${a}${r}${g}${b})`;
  }
  return `Color(0xFF${r}${g}${b})`;
}

function fillToComposeColor(fill: Fill): string {
  return hexToComposeColor(fill.color, fill.opacity);
}

function fillToComposeBrush(fill: Fill): string | null {
  if (!fill.gradient) return null;

  const gradient = fill.gradient;
  const colors = gradient.stops.map((s) => hexToComposeColor(s.color, fill.opacity)).join(', ');

  if (gradient.type === 'linear') {
    const angle = gradient.angle ?? 0;
    const rad = (angle * Math.PI) / 180;
    const x1 = roundTo(Math.sin(rad) * 0.5 + 0.5, 3);
    const y1 = roundTo(-Math.cos(rad) * 0.5 + 0.5, 3);
    const x2 = roundTo(1 - x1, 3);
    const y2 = roundTo(1 - y1, 3);
    return `Brush.linearGradient(colors = listOf(${colors}), start = Offset(${x1}f, ${y1}f), end = Offset(${x2}f, ${y2}f))`;
  }

  const cx = roundTo(gradient.cx ?? 0.5, 3);
  const cy = roundTo(gradient.cy ?? 0.5, 3);
  const r = roundTo((gradient.r ?? 0.5) * 100, 1);
  return `Brush.radialGradient(colors = listOf(${colors}), center = Offset(${cx}f, ${cy}f), radius = ${r}f)`;
}

function cornerShapeCompose(shape: Shape): string | null {
  const radii = getEffectiveCornerRadii(shape);
  if (!radii) return null;

  const { tl, tr, br, bl } = radii;
  if (tl === tr && tr === br && br === bl) {
    return `RoundedCornerShape(${roundTo(tl, 1)}.dp)`;
  }
  return `RoundedCornerShape(topStart = ${roundTo(tl, 1)}.dp, topEnd = ${roundTo(tr, 1)}.dp, bottomStart = ${roundTo(bl, 1)}.dp, bottomEnd = ${roundTo(br, 1)}.dp)`;
}

function buildModifierChain(shape: Shape, extraParts: string[]): string {
  const parts: string[] = [...extraParts];

  parts.push(
    `size(width = ${roundTo(shape.width, 1)}.dp, height = ${roundTo(shape.height, 1)}.dp)`,
  );

  const cornerShape = cornerShapeCompose(shape);
  if (cornerShape) {
    parts.push(`clip(${cornerShape})`);
  }

  const fills = 'fills' in shape ? getVisibleFills(shape.fills as Fill[]) : [];
  if (fills.length > 0) {
    const fill = fills[0]!;
    const brush = fillToComposeBrush(fill);
    if (brush) {
      parts.push(`background(${brush})`);
    } else {
      parts.push(`background(${fillToComposeColor(fill)})`);
    }
  }

  const strokes = 'strokes' in shape ? getVisibleStrokes(shape.strokes as Stroke[]) : [];
  if (strokes.length > 0) {
    const stroke = strokes[0]!;
    const color = hexToComposeColor(stroke.color, stroke.opacity);
    const borderShape = cornerShape ?? 'RectangleShape';
    parts.push(`border(width = ${stroke.width}.dp, color = ${color}, shape = ${borderShape})`);
  }

  const shadows = 'shadows' in shape ? getVisibleShadows(shape.shadows as Shadow[]) : [];
  if (shadows.length > 0) {
    const shadow = shadows[0]!;
    if (shadow.type === 'drop') {
      const elevation = roundTo(shadow.blur / 2, 1);
      const shadowShape = cornerShape ?? 'RectangleShape';
      parts.push(`shadow(elevation = ${elevation}.dp, shape = ${shadowShape})`);
    }
  }

  const blurs = 'blurs' in shape ? getVisibleBlurs(shape.blurs as Blur[]) : [];
  for (const blur of blurs) {
    if (blur.type === 'layer') {
      parts.push(`blur(radius = ${roundTo(blur.radius, 1)}.dp)`);
    }
  }

  if (shape.opacity < 1) {
    parts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
  }

  if (shape.rotation !== 0) {
    parts.push(`rotate(${roundTo(shape.rotation, 2)}f)`);
  }

  if (shape.blendMode !== 'normal') {
    parts.push(`graphicsLayer { blendMode = BlendMode.${blendModeToCompose(shape.blendMode)} }`);
  }

  if (parts.length === 0) return 'Modifier';
  return `Modifier\n    .${parts.join('\n    .')}`;
}

function blendModeToCompose(mode: string): string {
  const map: Record<string, string> = {
    multiply: 'Multiply',
    screen: 'Screen',
    overlay: 'Overlay',
    darken: 'Darken',
    lighten: 'Lighten',
    'color-dodge': 'ColorDodge',
    'color-burn': 'ColorBurn',
    'hard-light': 'Hardlight',
    'soft-light': 'Softlight',
    difference: 'Difference',
    exclusion: 'Exclusion',
    hue: 'Hue',
    saturation: 'Saturation',
    color: 'Color',
    luminosity: 'Luminosity',
  };
  return map[mode] ?? 'SrcOver';
}

function boxWithModifier(shape: Shape): string {
  const modifier = buildModifierChain(shape, []);
  return `Box(\n  modifier = ${modifier}\n)`;
}

function rectangleToCompose(shape: RectangleShape): string {
  const modifier = buildModifierChain(shape, []);
  return `Box(\n  modifier = ${modifier}\n)`;
}

function ellipseToCompose(shape: EllipseShape): string {
  const parts: string[] = [];
  parts.push(
    `size(width = ${roundTo(shape.width, 1)}.dp, height = ${roundTo(shape.height, 1)}.dp)`,
  );
  parts.push('clip(CircleShape)');

  const fills = getVisibleFills(shape.fills);
  if (fills.length > 0) {
    const fill = fills[0]!;
    const brush = fillToComposeBrush(fill);
    if (brush) {
      parts.push(`background(${brush})`);
    } else {
      parts.push(`background(${fillToComposeColor(fill)})`);
    }
  }

  const strokes = getVisibleStrokes(shape.strokes);
  if (strokes.length > 0) {
    const stroke = strokes[0]!;
    const color = hexToComposeColor(stroke.color, stroke.opacity);
    parts.push(`border(width = ${stroke.width}.dp, color = ${color}, shape = CircleShape)`);
  }

  const shadows = getVisibleShadows(shape.shadows);
  if (shadows.length > 0 && shadows[0]!.type === 'drop') {
    const elevation = roundTo(shadows[0]!.blur / 2, 1);
    parts.push(`shadow(elevation = ${elevation}.dp, shape = CircleShape)`);
  }

  const blurs = getVisibleBlurs(shape.blurs);
  for (const blur of blurs) {
    if (blur.type === 'layer') {
      parts.push(`blur(radius = ${roundTo(blur.radius, 1)}.dp)`);
    }
  }

  if (shape.opacity < 1) {
    parts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
  }

  if (shape.rotation !== 0) {
    parts.push(`rotate(${roundTo(shape.rotation, 2)}f)`);
  }

  const modifier = `Modifier\n    .${parts.join('\n    .')}`;
  return `Box(\n  modifier = ${modifier}\n)`;
}

function frameToCompose(shape: FrameShape, children: ShapeTreeNode[]): string {
  const childCode = children
    .filter((c) => c.shape.visible)
    .map((c) => nodeToCompose(c, 1))
    .join('\n');

  let container: string;
  const modifierParts: string[] = [];

  modifierParts.push(
    `size(width = ${roundTo(shape.width, 1)}.dp, height = ${roundTo(shape.height, 1)}.dp)`,
  );

  const cornerShape = cornerShapeCompose(shape);
  if (cornerShape) {
    modifierParts.push(`clip(${cornerShape})`);
  } else if (shape.clip) {
    modifierParts.push('clip(RectangleShape)');
  }

  const fills = getVisibleFills(shape.fills);
  if (fills.length > 0) {
    const fill = fills[0]!;
    const brush = fillToComposeBrush(fill);
    if (brush) {
      modifierParts.push(`background(${brush})`);
    } else {
      modifierParts.push(`background(${fillToComposeColor(fill)})`);
    }
  }

  const strokes = getVisibleStrokes(shape.strokes);
  if (strokes.length > 0) {
    const stroke = strokes[0]!;
    const color = hexToComposeColor(stroke.color, stroke.opacity);
    const borderShape = cornerShape ?? 'RectangleShape';
    modifierParts.push(
      `border(width = ${stroke.width}.dp, color = ${color}, shape = ${borderShape})`,
    );
  }

  const shadows = getVisibleShadows(shape.shadows);
  if (shadows.length > 0 && shadows[0]!.type === 'drop') {
    const elevation = roundTo(shadows[0]!.blur / 2, 1);
    const shadowShape = cornerShape ?? 'RectangleShape';
    modifierParts.push(`shadow(elevation = ${elevation}.dp, shape = ${shadowShape})`);
  }

  const blurs = getVisibleBlurs(shape.blurs);
  for (const blur of blurs) {
    if (blur.type === 'layer') {
      modifierParts.push(`blur(radius = ${roundTo(blur.radius, 1)}.dp)`);
    }
  }

  if (shape.opacity < 1) {
    modifierParts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
  }

  if (shape.rotation !== 0) {
    modifierParts.push(`rotate(${roundTo(shape.rotation, 2)}f)`);
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
      modifierParts.push(`padding(${roundTo(shape.paddingTop, 1)}.dp)`);
    } else {
      modifierParts.push(
        `padding(top = ${roundTo(shape.paddingTop, 1)}.dp, start = ${roundTo(shape.paddingLeft, 1)}.dp, bottom = ${roundTo(shape.paddingBottom, 1)}.dp, end = ${roundTo(shape.paddingRight, 1)}.dp)`,
      );
    }
  }

  const modifierStr =
    modifierParts.length > 0 ? `Modifier\n      .${modifierParts.join('\n      .')}` : 'Modifier';

  if (shape.layoutMode === 'horizontal') {
    const arrangement = justifyToArrangement(shape.layoutJustify, shape.layoutGap, 'h');
    const alignment = alignToComposeAlignment(shape.layoutAlign, 'h');
    container = `Row(\n  modifier = ${modifierStr},\n  horizontalArrangement = ${arrangement},\n  verticalAlignment = ${alignment}\n)`;
  } else if (shape.layoutMode === 'vertical') {
    const arrangement = justifyToArrangement(shape.layoutJustify, shape.layoutGap, 'v');
    const alignment = alignToComposeAlignment(shape.layoutAlign, 'v');
    container = `Column(\n  modifier = ${modifierStr},\n  verticalArrangement = ${arrangement},\n  horizontalAlignment = ${alignment}\n)`;
  } else {
    container = `Box(\n  modifier = ${modifierStr}\n)`;
  }

  if (childCode) {
    return `${container} {\n${childCode}\n}`;
  }
  return `${container} {}`;
}

function justifyToArrangement(
  justify: FrameShape['layoutJustify'],
  gap: number,
  direction: 'h' | 'v',
): string {
  switch (justify) {
    case 'start':
      if (gap > 0) return `Arrangement.spacedBy(${roundTo(gap, 1)}.dp)`;
      return direction === 'h' ? 'Arrangement.Start' : 'Arrangement.Top';
    case 'center':
      if (gap > 0)
        return `Arrangement.spacedBy(${roundTo(gap, 1)}.dp, Alignment.CenterHorizontally)`;
      return 'Arrangement.Center';
    case 'end':
      if (gap > 0) return `Arrangement.spacedBy(${roundTo(gap, 1)}.dp, Alignment.End)`;
      return direction === 'h' ? 'Arrangement.End' : 'Arrangement.Bottom';
    case 'space_between':
      return 'Arrangement.SpaceBetween';
    case 'space_around':
      return 'Arrangement.SpaceAround';
  }
}

function alignToComposeAlignment(align: FrameShape['layoutAlign'], direction: 'h' | 'v'): string {
  if (direction === 'h') {
    switch (align) {
      case 'start':
        return 'Alignment.Top';
      case 'center':
        return 'Alignment.CenterVertically';
      case 'end':
        return 'Alignment.Bottom';
      case 'stretch':
        return 'Alignment.CenterVertically';
    }
  }
  switch (align) {
    case 'start':
      return 'Alignment.Start';
    case 'center':
      return 'Alignment.CenterHorizontally';
    case 'end':
      return 'Alignment.End';
    case 'stretch':
      return 'Alignment.CenterHorizontally';
  }
}

function textToCompose(shape: TextShape): string {
  const content = shape.content.replace(/"/g, '\\"');

  const params: string[] = [];
  params.push(`text = "${content}"`);

  const fills = getVisibleFills(shape.fills);
  if (fills.length > 0) {
    const fill = fills[0]!;
    params.push(`color = ${fillToComposeColor(fill)}`);
  }

  params.push(`fontSize = ${roundTo(shape.fontSize, 1)}.sp`);

  if (shape.fontWeight !== 400) {
    params.push(`fontWeight = FontWeight(${shape.fontWeight})`);
  }

  if (shape.fontFamily !== 'Inter') {
    params.push(`fontFamily = FontFamily("${shape.fontFamily}")`);
  }

  if (shape.fontStyle === 'italic') {
    params.push('fontStyle = FontStyle.Italic');
  }

  if (shape.letterSpacing !== 0) {
    params.push(`letterSpacing = ${roundTo(shape.letterSpacing, 2)}.sp`);
  }

  if (shape.textAlign !== 'left') {
    const alignMap: Record<string, string> = {
      center: 'TextAlign.Center',
      right: 'TextAlign.End',
    };
    params.push(`textAlign = ${alignMap[shape.textAlign] ?? 'TextAlign.Start'}`);
  }

  if (shape.textDecoration === 'underline') {
    params.push('textDecoration = TextDecoration.Underline');
  } else if (shape.textDecoration === 'strikethrough') {
    params.push('textDecoration = TextDecoration.LineThrough');
  }

  if (shape.lineHeight !== 1.2) {
    params.push(`lineHeight = ${roundTo(shape.lineHeight * shape.fontSize, 1)}.sp`);
  }

  if (shape.textTruncation === 'ending') {
    params.push('maxLines = 1');
    params.push('overflow = TextOverflow.Ellipsis');
  }

  const modifierParts: string[] = [];
  modifierParts.push(
    `size(width = ${roundTo(shape.width, 1)}.dp, height = ${roundTo(shape.height, 1)}.dp)`,
  );

  if (shape.opacity < 1) {
    modifierParts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
  }

  if (shape.rotation !== 0) {
    modifierParts.push(`rotate(${roundTo(shape.rotation, 2)}f)`);
  }

  const shadows = getVisibleShadows(shape.shadows);
  if (shadows.length > 0 && shadows[0]!.type === 'drop') {
    const elevation = roundTo(shadows[0]!.blur / 2, 1);
    modifierParts.push(`shadow(elevation = ${elevation}.dp)`);
  }

  if (modifierParts.length > 0) {
    const modifier = `Modifier\n    .${modifierParts.join('\n    .')}`;
    params.push(`modifier = ${modifier}`);
  }

  const formattedParams = params.map((p) => `  ${p}`).join(',\n');
  return `Text(\n${formattedParams}\n)`;
}

function vectorToCompose(shape: Shape): string {
  const svgPathData =
    'svgPathData' in shape ? (shape.svgPathData as string | undefined) : undefined;

  if (svgPathData) {
    const modifierParts: string[] = [];
    modifierParts.push(
      `size(width = ${roundTo(shape.width, 1)}.dp, height = ${roundTo(shape.height, 1)}.dp)`,
    );

    if (shape.opacity < 1) {
      modifierParts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
    }

    if (shape.rotation !== 0) {
      modifierParts.push(`rotate(${roundTo(shape.rotation, 2)}f)`);
    }

    const modifier =
      modifierParts.length > 0 ? `Modifier\n    .${modifierParts.join('\n    .')}` : 'Modifier';

    const fills = 'fills' in shape ? getVisibleFills(shape.fills as Fill[]) : [];
    const fillColor = fills.length > 0 ? fillToComposeColor(fills[0]!) : 'Color.Black';

    return `Canvas(\n  modifier = ${modifier}\n) {\n  drawPath(\n    path = PathParser.createPathFromPathData("${svgPathData}"),\n    color = ${fillColor}\n  )\n}`;
  }

  return boxWithModifier(shape);
}

function lineToCompose(shape: LineShape): string {
  const dx = shape.x2 - shape.x1;
  const dy = shape.y2 - shape.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const strokes = getVisibleStrokes(shape.strokes);
  const color =
    strokes.length > 0 ? hexToComposeColor(strokes[0]!.color, strokes[0]!.opacity) : 'Color.Black';
  const strokeWidth = strokes.length > 0 ? strokes[0]!.width : 1;

  const modifierParts: string[] = [];
  modifierParts.push(`size(width = ${roundTo(length, 1)}.dp, height = ${strokeWidth}.dp)`);

  const totalAngle = angle + shape.rotation;
  if (totalAngle !== 0) {
    modifierParts.push(`rotate(${roundTo(totalAngle, 2)}f)`);
  }

  modifierParts.push(`background(${color})`);

  if (shape.opacity < 1) {
    modifierParts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
  }

  const modifier = `Modifier\n    .${modifierParts.join('\n    .')}`;
  return `Box(\n  modifier = ${modifier}\n)`;
}

function imageToCompose(shape: ImageShape): string {
  const fitMap: Record<ImageShape['fit'], string> = {
    fill: 'ContentScale.Crop',
    fit: 'ContentScale.Fit',
    crop: 'ContentScale.Crop',
  };

  const modifierParts: string[] = [];
  modifierParts.push(
    `size(width = ${roundTo(shape.width, 1)}.dp, height = ${roundTo(shape.height, 1)}.dp)`,
  );

  if (shape.fit === 'crop' || shape.fit === 'fill') {
    modifierParts.push('clip(RectangleShape)');
  }

  if (shape.opacity < 1) {
    modifierParts.push(`alpha(${roundTo(shape.opacity, 2)}f)`);
  }

  if (shape.rotation !== 0) {
    modifierParts.push(`rotate(${roundTo(shape.rotation, 2)}f)`);
  }

  const modifier =
    modifierParts.length > 0 ? `Modifier\n    .${modifierParts.join('\n    .')}` : 'Modifier';

  const src = shape.src || 'placeholder';
  return `AsyncImage(\n  model = "${src}",\n  contentDescription = null,\n  modifier = ${modifier},\n  contentScale = ${fitMap[shape.fit]}\n)`;
}

function groupToCompose(node: ShapeTreeNode): string {
  const children = node.children
    .filter((c) => c.shape.visible)
    .map((c) => nodeToCompose(c, 1))
    .join('\n');

  const modifierParts: string[] = [];
  if (node.shape.opacity < 1) {
    modifierParts.push(`alpha(${roundTo(node.shape.opacity, 2)}f)`);
  }
  if (node.shape.rotation !== 0) {
    modifierParts.push(`rotate(${roundTo(node.shape.rotation, 2)}f)`);
  }

  const modifier =
    modifierParts.length > 0 ? `Modifier\n    .${modifierParts.join('\n    .')}` : '';

  const modifierParam = modifier ? `\n  modifier = ${modifier}\n` : '';
  const body = children ? `Box(${modifierParam}) {\n${children}\n}` : `Box(${modifierParam}) {}`;
  return body;
}
