import type { ArrowheadType, Blur, Fill, Shadow, Shape, Stroke } from '@draftila/shared';
import type { Renderer, RenderStyle, RenderTransform } from './renderer/types';
import { simpleStyle } from './renderer/types';
import getStroke from 'perfect-freehand';
import { svgToDataUri } from './image-cache';
import {
  computeArrowheadGeometry,
  generatePolygonPoints,
  generateStarPoints,
  getCornerRadii,
} from './shape-geometry';

export {
  type ArrowheadGeometry,
  computeArrowheadGeometry,
  generatePolygonPoints,
  generateStarPoints,
  getCornerRadii,
} from './shape-geometry';

function preserveAspectRatioToFit(value: string | undefined): 'fill' | 'fit' | 'crop' {
  const normalized = (value ?? 'xMidYMid meet').trim().toLowerCase();
  if (normalized === 'none') return 'fill';
  if (normalized.includes('slice')) return 'crop';
  return 'fit';
}

function getTransform(shape: Shape): RenderTransform {
  return {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rotation: shape.rotation,
  };
}

function getStyle(
  shape: Shape & { fills?: Fill[]; strokes?: Stroke[]; shadows?: Shadow[]; blurs?: Blur[] },
): RenderStyle {
  return {
    fills: shape.fills ?? [],
    strokes: shape.strokes ?? [],
    shadows: shape.shadows ?? [],
    blurs: shape.blurs ?? [],
    opacity: shape.opacity,
    blendMode: shape.blendMode,
  };
}

function getSvgPathFromStroke(points: number[][]): Array<[number, number]> {
  if (points.length === 0) return [];
  return points.map((p) => [p[0]!, p[1]!] as [number, number]);
}

function primaryStrokeWidth(strokes: Stroke[]): number {
  const visible = strokes.find((s) => s.visible);
  return visible?.width ?? 0;
}

function hasSvgPathData(shape: Shape): shape is Shape & { svgPathData: string } {
  return (
    'svgPathData' in shape && typeof shape.svgPathData === 'string' && shape.svgPathData.length > 0
  );
}

export function renderShape(renderer: Renderer, shape: Shape) {
  if (!shape.visible) return;

  switch (shape.type) {
    case 'rectangle': {
      if (hasSvgPathData(shape)) {
        renderer.drawSvgPath(getTransform(shape), shape.svgPathData, getStyle(shape));
        break;
      }
      renderer.drawRect(getTransform(shape), getStyle(shape), getCornerRadii(shape));
      break;
    }
    case 'ellipse': {
      if (hasSvgPathData(shape)) {
        renderer.drawSvgPath(getTransform(shape), shape.svgPathData, getStyle(shape));
        break;
      }
      renderer.drawEllipse(getTransform(shape), getStyle(shape));
      break;
    }
    case 'frame': {
      renderer.drawRect(getTransform(shape), getStyle(shape), getCornerRadii(shape));
      const guides = shape.guides ?? [];
      if (guides.length > 0) {
        renderer.drawLayoutGuides(getTransform(shape), guides);
      }
      break;
    }
    case 'text': {
      renderer.drawText(getTransform(shape), {
        content: shape.content,
        fontSize: shape.fontSize,
        fontFamily: shape.fontFamily,
        fontWeight: shape.fontWeight,
        fontStyle: shape.fontStyle,
        textAlign: shape.textAlign,
        verticalAlign: shape.verticalAlign,
        lineHeight: shape.lineHeight,
        letterSpacing: shape.letterSpacing,
        textDecoration: shape.textDecoration,
        textTransform: shape.textTransform,
        textTruncation: shape.textTruncation,
        fills: shape.fills,
        segments: shape.segments,
        shadows: shape.shadows ?? [],
        blurs: shape.blurs ?? [],
      });
      break;
    }
    case 'path': {
      if (shape.svgPathData) {
        renderer.drawSvgPath(
          getTransform(shape),
          shape.svgPathData,
          getStyle(shape),
          shape.fillRule,
        );
        break;
      }
      if (shape.points.length < 2) break;
      const inputPoints = shape.points.map(
        (p) => [p.x, p.y, p.pressure] as [number, number, number],
      );
      const strokeWidth = primaryStrokeWidth(shape.strokes);
      const strokePoints = getStroke(inputPoints, {
        size: strokeWidth > 0 ? strokeWidth : 4,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true,
      });
      const outlinePoints = getSvgPathFromStroke(strokePoints);
      if (outlinePoints.length > 0) {
        renderer.drawPath(outlinePoints, {
          fills: shape.fills,
          strokes: [],
          shadows: shape.shadows ?? [],
          blurs: shape.blurs ?? [],
          opacity: shape.opacity,
        });
      }
      break;
    }
    case 'line': {
      if (
        hasSvgPathData(shape) &&
        shape.startArrowhead === 'none' &&
        shape.endArrowhead === 'none'
      ) {
        renderer.drawSvgPath(getTransform(shape), shape.svgPathData, {
          fills: [],
          strokes: shape.strokes,
          shadows: shape.shadows ?? [],
          blurs: shape.blurs ?? [],
          opacity: shape.opacity,
        });
        break;
      }
      const linePoints: Array<[number, number]> = [
        [shape.x1, shape.y1],
        [shape.x2, shape.y2],
      ];
      const lineStyle: RenderStyle = {
        fills: [],
        strokes: shape.strokes,
        shadows: shape.shadows ?? [],
        blurs: shape.blurs ?? [],
        opacity: shape.opacity,
      };
      renderer.drawPath(linePoints, lineStyle, false);

      const sw = primaryStrokeWidth(shape.strokes);
      const primaryStroke = shape.strokes.find((s) => s.visible);
      const strokeColor = primaryStroke?.color ?? '#000000';
      const strokeOpacity = primaryStroke?.opacity ?? 1;

      const strokeCap = primaryStroke?.cap ?? 'butt';
      const arrowJoin = strokeCap === 'round' ? ('round' as const) : ('miter' as const);
      const headStroke = {
        color: strokeColor,
        width: sw,
        opacity: strokeOpacity,
        visible: true,
        cap: strokeCap,
        join: arrowJoin,
        align: 'center' as const,
        dashPattern: 'solid' as const,
        dashOffset: 0,
        miterLimit: 4,
      };

      const renderArrowhead = (
        tipX: number,
        tipY: number,
        tailX: number,
        tailY: number,
        type: ArrowheadType,
      ) => {
        const geom = computeArrowheadGeometry(tipX, tipY, tailX, tailY, sw, type);
        if (!geom) return;
        if (geom.closed) {
          renderer.drawPath(
            geom.points,
            {
              fills: [{ color: strokeColor, opacity: strokeOpacity, visible: true }],
              strokes: [headStroke],
              shadows: [],
              blurs: [],
              opacity: shape.opacity,
            },
            true,
          );
        } else {
          renderer.drawPath(
            geom.points,
            {
              fills: [],
              strokes: [headStroke],
              shadows: [],
              blurs: [],
              opacity: shape.opacity,
            },
            false,
          );
        }
      };

      renderArrowhead(shape.x2, shape.y2, shape.x1, shape.y1, shape.endArrowhead);
      renderArrowhead(shape.x1, shape.y1, shape.x2, shape.y2, shape.startArrowhead);
      break;
    }
    case 'polygon': {
      if (hasSvgPathData(shape)) {
        renderer.drawSvgPath(getTransform(shape), shape.svgPathData, getStyle(shape));
        break;
      }
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const polyPoints = generatePolygonPoints(
        cx,
        cy,
        shape.width / 2,
        shape.height / 2,
        shape.sides,
      );
      renderer.drawPath(polyPoints, getStyle(shape));
      break;
    }
    case 'star': {
      if (hasSvgPathData(shape)) {
        renderer.drawSvgPath(getTransform(shape), shape.svgPathData, getStyle(shape));
        break;
      }
      const starCx = shape.x + shape.width / 2;
      const starCy = shape.y + shape.height / 2;
      const starPts = generateStarPoints(
        starCx,
        starCy,
        shape.width / 2,
        shape.height / 2,
        shape.points as number,
        shape.innerRadius,
      );
      renderer.drawPath(starPts, getStyle(shape));
      break;
    }

    case 'image': {
      renderer.drawImage(getTransform(shape), {
        src: shape.src,
        fit: shape.fit,
        cropX: (shape as Shape & { cropX?: number }).cropX,
        cropY: (shape as Shape & { cropY?: number }).cropY,
        opacity: shape.opacity,
        shadows: shape.shadows ?? [],
        blurs: shape.blurs ?? [],
      });
      break;
    }
    case 'group': {
      break;
    }
    case 'svg': {
      if (!shape.svgContent) break;
      renderer.drawImage(getTransform(shape), {
        src: svgToDataUri(shape.svgContent),
        fit: preserveAspectRatioToFit(shape.preserveAspectRatio),
        opacity: shape.opacity,
        shadows: shape.shadows ?? [],
        blurs: shape.blurs ?? [],
      });
      break;
    }
  }
}

export function renderSelectionForShape(renderer: Renderer, shape: Shape, zoom: number) {
  if (shape.type === 'line') {
    renderer.drawPath(
      [
        [shape.x1, shape.y1],
        [shape.x2, shape.y2],
      ],
      simpleStyle({ fill: null, stroke: '#0D99FF', strokeWidth: 2 / zoom, opacity: 1 }),
      false,
    );
    return;
  }
  renderer.drawSelectionBox(shape.x, shape.y, shape.width, shape.height, zoom, shape.rotation);
}

export function renderHoverForShape(renderer: Renderer, shape: Shape, zoom: number) {
  if (shape.type === 'line') {
    renderer.drawPath(
      [
        [shape.x1, shape.y1],
        [shape.x2, shape.y2],
      ],
      simpleStyle({ fill: null, stroke: '#0D99FF', strokeWidth: 2 / zoom, opacity: 1 }),
      false,
    );
    return;
  }
  renderer.drawHoverOutline(shape.x, shape.y, shape.width, shape.height, zoom, shape.rotation);
}

export const LOD_TEXT_LEGIBILITY_PX = 4;
export const LOD_DETAIL_ZOOM = 0.5;

export interface TextLegibilityTier {
  maxVisibleShapes: number;
  legibilityPx: number;
}

export const LOD_TEXT_TIERS: readonly TextLegibilityTier[] = [
  { maxVisibleShapes: 3000, legibilityPx: 2 },
  { maxVisibleShapes: 10000, legibilityPx: 4 },
  { maxVisibleShapes: Infinity, legibilityPx: 5 },
];

export const LOD_TIER_HYSTERESIS = 0.15;

function tierIndexFor(visibleShapes: number): number {
  const index = LOD_TEXT_TIERS.findIndex((tier) => visibleShapes <= tier.maxVisibleShapes);
  return index === -1 ? LOD_TEXT_TIERS.length - 1 : index;
}

export function textLegibilityForVisibleShapes(
  visibleShapes: number,
  currentPx: number = 0,
): number {
  const targetIndex = tierIndexFor(visibleShapes);
  const target = LOD_TEXT_TIERS[targetIndex]!.legibilityPx;

  const currentIndex = LOD_TEXT_TIERS.findIndex((tier) => tier.legibilityPx === currentPx);
  if (currentIndex === -1 || currentIndex === targetIndex) return target;

  const crossedBoundary =
    targetIndex > currentIndex
      ? LOD_TEXT_TIERS[currentIndex]!.maxVisibleShapes
      : LOD_TEXT_TIERS[currentIndex - 1]!.maxVisibleShapes;

  const settled =
    targetIndex > currentIndex
      ? visibleShapes > crossedBoundary * (1 + LOD_TIER_HYSTERESIS)
      : visibleShapes < crossedBoundary * (1 - LOD_TIER_HYSTERESIS);

  return settled ? target : currentPx;
}

export function simplifyShapeForZoom(
  shape: Shape,
  zoom: number,
  textLegibilityPx: number = LOD_TEXT_LEGIBILITY_PX,
): Shape {
  if (shape.type === 'text') {
    const fontSize = (shape as Shape & { fontSize?: number }).fontSize ?? 16;
    if (fontSize * zoom < textLegibilityPx) {
      return {
        ...shape,
        type: 'rectangle',
        svgPathData: undefined,
        cornerRadius: 0,
        opacity: (shape.opacity ?? 1) * 0.55,
      } as unknown as Shape;
    }
    return shape;
  }

  if (zoom >= LOD_DETAIL_ZOOM) return shape;

  const styled = shape as Shape & {
    fills?: Array<{ visible?: boolean }>;
    strokes?: unknown[];
    shadows?: unknown[];
    blurs?: unknown[];
  };

  const hasVisibleFill = styled.fills?.some((fill) => fill.visible !== false) ?? false;
  const strokeIsTheShape = shape.type === 'line' || !hasVisibleFill;
  const dropStrokes = !strokeIsTheShape && (styled.strokes?.length ?? 0) > 0;
  const dropShadows = (styled.shadows?.length ?? 0) > 0;
  const dropBlurs = (styled.blurs?.length ?? 0) > 0;

  if (!dropStrokes && !dropShadows && !dropBlurs) return shape;

  return {
    ...shape,
    ...(dropStrokes ? { strokes: [] } : {}),
    ...(dropShadows ? { shadows: [] } : {}),
    ...(dropBlurs ? { blurs: [] } : {}),
  } as unknown as Shape;
}
