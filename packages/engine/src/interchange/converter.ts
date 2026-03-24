import type { Shape, Fill, Stroke, Shadow, Blur, Gradient } from '@draftila/shared';
import type {
  InterchangeNode,
  InterchangeDocument,
  InterchangeFill,
  InterchangeStroke,
  InterchangeShadow,
  InterchangeBlur,
  InterchangeGradient,
  InterchangePathPoint,
} from './interchange-format';
import { createInterchangeNode, createInterchangeDocument } from './interchange-format';

function fillToInterchange(fill: Fill): InterchangeFill {
  return { color: fill.color, opacity: fill.opacity, visible: fill.visible };
}

function gradientToInterchange(g: Gradient): InterchangeGradient {
  const stops = g.stops.map((s) => ({ color: s.color, position: s.position }));
  if (g.type === 'radial') {
    return { type: 'radial', stops, cx: g.cx, cy: g.cy, r: g.r };
  }
  return { type: 'linear', stops, angle: g.angle };
}

function interchangeGradientToGradient(g: InterchangeGradient): Gradient {
  const stops = g.stops.map((s) => ({ color: s.color, position: s.position }));
  if (g.type === 'radial') {
    return { type: 'radial', stops, cx: g.cx ?? 0.5, cy: g.cy ?? 0.5, r: g.r ?? 0.5 };
  }
  return { type: 'linear', stops, angle: g.angle ?? 0 };
}

function interchangeToFill(fill: InterchangeFill): Fill {
  return { color: fill.color, opacity: fill.opacity, visible: fill.visible };
}

function strokeToInterchange(stroke: Stroke): InterchangeStroke {
  return {
    color: stroke.color,
    width: stroke.width,
    opacity: stroke.opacity,
    visible: stroke.visible,
    cap: stroke.cap,
    join: stroke.join,
    align: stroke.align,
    dashPattern: stroke.dashPattern,
    dashArray: stroke.dashArray,
    dashOffset: stroke.dashOffset,
    miterLimit: stroke.miterLimit,
  };
}

function interchangeToStroke(stroke: InterchangeStroke): Stroke {
  return {
    color: stroke.color,
    width: stroke.width,
    opacity: stroke.opacity,
    visible: stroke.visible,
    cap: stroke.cap,
    join: stroke.join,
    align: stroke.align,
    dashPattern: stroke.dashPattern,
    dashArray: stroke.dashArray,
    dashOffset: stroke.dashOffset,
    miterLimit: stroke.miterLimit,
  };
}

function shadowToInterchange(shadow: Shadow): InterchangeShadow {
  return {
    type: shadow.type,
    x: shadow.x,
    y: shadow.y,
    blur: shadow.blur,
    spread: shadow.spread,
    color: shadow.color,
    visible: shadow.visible,
  };
}

function interchangeToShadow(shadow: InterchangeShadow): Shadow {
  return {
    type: shadow.type,
    x: shadow.x,
    y: shadow.y,
    blur: shadow.blur,
    spread: shadow.spread,
    color: shadow.color,
    visible: shadow.visible,
  };
}

function blurToInterchange(blur: Blur): InterchangeBlur {
  return { type: blur.type, radius: blur.radius, visible: blur.visible };
}

function interchangeToBlur(blur: InterchangeBlur): Blur {
  return { type: blur.type, radius: blur.radius, visible: blur.visible };
}

function shapeToNode(shape: Shape, childrenByParent: Map<string, Shape[]>): InterchangeNode {
  const fills = 'fills' in shape ? (shape.fills as Fill[]) : [];
  const strokes = 'strokes' in shape ? (shape.strokes as Stroke[]) : [];
  const shadows = 'shadows' in shape ? (shape.shadows as Shadow[]) : [];
  const blurs = 'blurs' in shape ? (shape.blurs as Blur[]) : [];

  const children = (childrenByParent.get(shape.id) ?? []).map((child) =>
    shapeToNode(child, childrenByParent),
  );

  const gradients: InterchangeGradient[] = [];
  for (const fill of fills) {
    if (fill.gradient) {
      gradients.push(gradientToInterchange(fill.gradient));
    }
  }

  const node = createInterchangeNode(shape.type, {
    name: shape.name,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rotation: shape.rotation,
    opacity: shape.opacity,
    visible: shape.visible,
    locked: shape.locked,
    blendMode: shape.blendMode,
    fills: fills.map(fillToInterchange),
    gradients,
    strokes: strokes.map(strokeToInterchange),
    shadows: shadows.map(shadowToInterchange),
    blurs: blurs.map(blurToInterchange),
    children,
  });

  switch (shape.type) {
    case 'rectangle':
      node.cornerRadius = shape.cornerRadius;
      node.cornerRadiusTL = shape.cornerRadiusTL;
      node.cornerRadiusTR = shape.cornerRadiusTR;
      node.cornerRadiusBL = shape.cornerRadiusBL;
      node.cornerRadiusBR = shape.cornerRadiusBR;
      node.cornerSmoothing = shape.cornerSmoothing;
      node.svgPathData = shape.svgPathData;
      break;
    case 'text':
      node.content = shape.content;
      node.fontSize = shape.fontSize;
      node.fontFamily = shape.fontFamily;
      node.fontWeight = shape.fontWeight;
      node.fontStyle = shape.fontStyle;
      node.textAlign = shape.textAlign;
      node.verticalAlign = shape.verticalAlign;
      node.lineHeight = shape.lineHeight;
      node.letterSpacing = shape.letterSpacing;
      node.textDecoration = shape.textDecoration;
      node.textTransform = shape.textTransform;
      break;
    case 'path':
      node.svgPathData = shape.svgPathData;
      node.fillRule = shape.fillRule;
      node.pathPoints = shape.points.map(
        (p): InterchangePathPoint => ({ x: p.x, y: p.y, pressure: p.pressure }),
      );
      break;
    case 'line':
      node.x1 = shape.x1;
      node.y1 = shape.y1;
      node.x2 = shape.x2;
      node.y2 = shape.y2;
      node.startArrowhead = shape.startArrowhead;
      node.endArrowhead = shape.endArrowhead;
      node.svgPathData = shape.svgPathData;
      break;
    case 'polygon':
      node.sides = shape.sides;
      node.svgPathData = shape.svgPathData;
      break;
    case 'star':
      node.starPoints = shape.points as number;
      node.innerRadius = shape.innerRadius;
      node.svgPathData = shape.svgPathData;
      break;
    case 'frame':
      node.cornerRadius = shape.cornerRadius;
      node.cornerRadiusTL = shape.cornerRadiusTL;
      node.cornerRadiusTR = shape.cornerRadiusTR;
      node.cornerRadiusBL = shape.cornerRadiusBL;
      node.cornerRadiusBR = shape.cornerRadiusBR;
      node.cornerSmoothing = shape.cornerSmoothing;
      node.clip = shape.clip;
      break;
    case 'image':
      node.src = shape.src;
      node.fit = shape.fit;
      break;
    case 'svg':
      node.svgContent = shape.svgContent;
      node.preserveAspectRatio = shape.preserveAspectRatio;
      break;
  }

  return node;
}

export function shapesToInterchange(shapes: Shape[], source = 'draftila'): InterchangeDocument {
  const shapeIds = new Set(shapes.map((s) => s.id));
  const childrenByParent = new Map<string, Shape[]>();
  const topLevel: Shape[] = [];

  for (const shape of shapes) {
    if (shape.parentId && shapeIds.has(shape.parentId)) {
      const siblings = childrenByParent.get(shape.parentId);
      if (siblings) {
        siblings.push(shape);
      } else {
        childrenByParent.set(shape.parentId, [shape]);
      }
    } else {
      topLevel.push(shape);
    }
  }

  const nodes = topLevel.map((shape) => shapeToNode(shape, childrenByParent));
  return createInterchangeDocument(nodes, { source });
}

interface FlattenedShape {
  type: Shape['type'];
  props: Record<string, unknown>;
  parentId: string | null;
}

function nodeToFlatShapes(
  node: InterchangeNode,
  parentId: string | null,
  result: FlattenedShape[],
): void {
  const fills = node.fills.map(interchangeToFill);
  if (node.gradients.length > 0) {
    const gradient = interchangeGradientToGradient(node.gradients[0]!);
    if (fills.length > 0) {
      fills[0] = { ...fills[0]!, gradient };
    } else {
      fills.push({ color: '#000000', opacity: 1, visible: true, gradient });
    }
  }
  const strokes = node.strokes.map(interchangeToStroke);
  const shadows = node.shadows.map(interchangeToShadow);
  const blurs = node.blurs.map(interchangeToBlur);

  const base: Record<string, unknown> = {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    opacity: node.opacity,
    visible: node.visible,
    locked: node.locked,
    name: node.name,
    blendMode: node.blendMode,
  };

  switch (node.type) {
    case 'rectangle':
      Object.assign(base, {
        fills,
        strokes,
        shadows,
        blurs,
        cornerRadius: node.cornerRadius ?? 0,
        cornerRadiusTL: node.cornerRadiusTL,
        cornerRadiusTR: node.cornerRadiusTR,
        cornerRadiusBL: node.cornerRadiusBL,
        cornerRadiusBR: node.cornerRadiusBR,
        cornerSmoothing: node.cornerSmoothing ?? 0,
        svgPathData: node.svgPathData,
      });
      break;
    case 'ellipse':
      Object.assign(base, { fills, strokes, shadows, blurs, svgPathData: node.svgPathData });
      break;
    case 'frame':
      Object.assign(base, {
        fills,
        strokes,
        shadows,
        blurs,
        cornerRadius: node.cornerRadius ?? 0,
        cornerRadiusTL: node.cornerRadiusTL,
        cornerRadiusTR: node.cornerRadiusTR,
        cornerRadiusBL: node.cornerRadiusBL,
        cornerRadiusBR: node.cornerRadiusBR,
        cornerSmoothing: node.cornerSmoothing ?? 0,
        clip: node.clip ?? true,
      });
      break;
    case 'text':
      Object.assign(base, {
        fills,
        shadows,
        blurs,
        content: node.content ?? '',
        fontSize: node.fontSize ?? 16,
        fontFamily: node.fontFamily ?? 'Inter',
        fontWeight: node.fontWeight ?? 400,
        fontStyle: node.fontStyle ?? 'normal',
        textAlign: node.textAlign ?? 'left',
        verticalAlign: node.verticalAlign ?? 'middle',
        lineHeight: node.lineHeight ?? 1.2,
        letterSpacing: node.letterSpacing ?? 0,
        textDecoration: node.textDecoration ?? 'none',
        textTransform: node.textTransform ?? 'none',
      });
      break;
    case 'path':
      Object.assign(base, {
        fills,
        strokes,
        shadows,
        blurs,
        svgPathData: node.svgPathData,
        fillRule: node.fillRule ?? 'nonzero',
        points: (node.pathPoints ?? []).map((p) => ({
          x: p.x,
          y: p.y,
          pressure: p.pressure,
        })),
      });
      break;
    case 'line':
      Object.assign(base, {
        strokes,
        shadows,
        blurs,
        x1: node.x1 ?? 0,
        y1: node.y1 ?? 0,
        x2: node.x2 ?? node.width,
        y2: node.y2 ?? 0,
        startArrowhead: node.startArrowhead ?? 'none',
        endArrowhead: node.endArrowhead ?? 'none',
        svgPathData: node.svgPathData,
      });
      break;
    case 'polygon':
      Object.assign(base, {
        fills,
        strokes,
        shadows,
        blurs,
        sides: node.sides ?? 6,
        svgPathData: node.svgPathData,
      });
      break;
    case 'star':
      Object.assign(base, {
        fills,
        strokes,
        shadows,
        blurs,
        points: node.starPoints ?? 5,
        innerRadius: node.innerRadius ?? 0.38,
        svgPathData: node.svgPathData,
      });
      break;
    case 'image':
      Object.assign(base, {
        shadows,
        blurs,
        src: node.src ?? '',
        fit: node.fit ?? 'fill',
      });
      break;
    case 'svg':
      Object.assign(base, {
        shadows,
        blurs,
        svgContent: node.svgContent ?? '',
        preserveAspectRatio: node.preserveAspectRatio ?? 'xMidYMid meet',
      });
      break;
    case 'group':
      Object.assign(base, { shadows, blurs });
      break;
  }

  const index = result.length;
  result.push({ type: node.type, props: base, parentId });

  const syntheticId = `__interchange_${index}`;
  for (const child of node.children) {
    nodeToFlatShapes(child, syntheticId, result);
  }
}

export interface ConvertedShape {
  type: Shape['type'];
  props: Record<string, unknown>;
  parentIndex: number | null;
}

export function interchangeToShapeData(doc: InterchangeDocument): ConvertedShape[] {
  const flat: FlattenedShape[] = [];
  for (const node of doc.nodes) {
    nodeToFlatShapes(node, null, flat);
  }

  const idToIndex = new Map<string, number>();
  for (let i = 0; i < flat.length; i++) {
    idToIndex.set(`__interchange_${i}`, i);
  }

  return flat.map((item) => ({
    type: item.type,
    props: item.props,
    parentIndex: item.parentId ? (idToIndex.get(item.parentId) ?? null) : null,
  }));
}
