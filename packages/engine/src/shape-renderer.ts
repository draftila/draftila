import type { ArrowheadType, Blur, Fill, Shadow, Shape, Stroke } from '@draftila/shared';
import type { Renderer, RenderStyle, RenderTransform } from './renderer/types';
import { simpleStyle } from './renderer/types';
import getStroke from 'perfect-freehand';
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

function svgToDataUri(svgContent: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
}

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
      const bs = shape.brushSettings;
      const strokePoints = getStroke(inputPoints, {
        size: bs?.size ?? (strokeWidth > 0 ? strokeWidth : 4),
        thinning: bs?.thinning ?? 0.5,
        smoothing: bs?.smoothing ?? 0.5,
        streamline: bs?.streamline ?? 0.5,
        simulatePressure: bs?.simulatePressure ?? true,
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
