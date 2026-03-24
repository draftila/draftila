import type { ArrowheadType, Blur, Fill, Shadow, Shape, Stroke } from '@draftila/shared';
import type { Renderer, RenderStyle, RenderTransform } from './renderer/types';
import { simpleStyle } from './renderer/types';
import getStroke from 'perfect-freehand';

export function getCornerRadii(shape: {
  cornerRadius: number;
  cornerRadiusTL?: number;
  cornerRadiusTR?: number;
  cornerRadiusBL?: number;
  cornerRadiusBR?: number;
}): number | [number, number, number, number] {
  const hasIndependentCorners =
    shape.cornerRadiusTL !== undefined ||
    shape.cornerRadiusTR !== undefined ||
    shape.cornerRadiusBL !== undefined ||
    shape.cornerRadiusBR !== undefined;
  return hasIndependentCorners
    ? [
        shape.cornerRadiusTL ?? shape.cornerRadius,
        shape.cornerRadiusTR ?? shape.cornerRadius,
        shape.cornerRadiusBR ?? shape.cornerRadius,
        shape.cornerRadiusBL ?? shape.cornerRadius,
      ]
    : shape.cornerRadius;
}

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

export function generatePolygonPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sides: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return points;
}

export function generateStarPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  numPoints: number,
  innerRadius: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const totalPoints = numPoints * 2;
  for (let i = 0; i < totalPoints; i++) {
    const angle = (i * Math.PI) / numPoints - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const r = isOuter ? 1 : innerRadius;
    points.push([cx + rx * r * Math.cos(angle), cy + ry * r * Math.sin(angle)]);
  }
  return points;
}

export interface ArrowheadGeometry {
  points: Array<[number, number]>;
  closed: boolean;
}

export function computeArrowheadGeometry(
  tipX: number,
  tipY: number,
  tailX: number,
  tailY: number,
  strokeWidth: number,
  type: ArrowheadType,
): ArrowheadGeometry | null {
  if (type === 'none') return null;

  const sw = Math.max(strokeWidth, 1);
  const headLen = sw * 4 + 4;
  const halfSpread = Math.PI / 6;
  const angle = Math.atan2(tipY - tailY, tipX - tailX);

  switch (type) {
    case 'line_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return {
        points: [
          [lx, ly],
          [tipX, tipY],
          [rx, ry],
        ],
        closed: false,
      };
    }
    case 'triangle_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return {
        points: [
          [tipX, tipY],
          [lx, ly],
          [rx, ry],
        ],
        closed: true,
      };
    }
    case 'reversed_triangle': {
      const baseX = tipX + headLen * Math.cos(angle);
      const baseY = tipY + headLen * Math.sin(angle);
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return {
        points: [
          [baseX, baseY],
          [lx, ly],
          [rx, ry],
        ],
        closed: true,
      };
    }
    case 'circle_arrow': {
      const r = sw * 2.5 + 2;
      const segments = 32;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push([tipX + r * Math.cos(a), tipY + r * Math.sin(a)]);
      }
      return { points: pts, closed: true };
    }
    case 'diamond_arrow': {
      const half = sw * 2.5 + 2;
      const cx = tipX - half * Math.cos(angle);
      const cy = tipY - half * Math.sin(angle);
      const backX = cx - half * Math.cos(angle);
      const backY = cy - half * Math.sin(angle);
      return {
        points: [
          [tipX, tipY],
          [cx - half * Math.sin(angle), cy + half * Math.cos(angle)],
          [backX, backY],
          [cx + half * Math.sin(angle), cy - half * Math.cos(angle)],
        ],
        closed: true,
      };
    }
  }
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
