import type { Fill, Shape, Stroke } from '@draftila/shared';
import type { Renderer, RenderStyle, RenderTransform } from './renderer/types';
import { simpleStyle } from './renderer/types';
import getStroke from 'perfect-freehand';

function getTransform(shape: Shape): RenderTransform {
  return {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rotation: shape.rotation,
  };
}

function getStyle(shape: Shape & { fills?: Fill[]; strokes?: Stroke[] }): RenderStyle {
  return {
    fills: shape.fills ?? [],
    strokes: shape.strokes ?? [],
    opacity: shape.opacity,
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

export interface ArrowHeadPoints {
  left: [number, number];
  tip: [number, number];
  right: [number, number];
}

export function computeArrowHead(
  tipX: number,
  tipY: number,
  tailX: number,
  tailY: number,
  strokeWidth: number,
): ArrowHeadPoints {
  const headSize = Math.max(16, strokeWidth * 5);
  const headAngle = Math.PI / 6;
  const angle = Math.atan2(tipY - tailY, tipX - tailX);
  return {
    left: [
      tipX - headSize * Math.cos(angle - headAngle),
      tipY - headSize * Math.sin(angle - headAngle),
    ],
    tip: [tipX, tipY],
    right: [
      tipX - headSize * Math.cos(angle + headAngle),
      tipY - headSize * Math.sin(angle + headAngle),
    ],
  };
}

function primaryStrokeWidth(strokes: Stroke[]): number {
  const visible = strokes.find((s) => s.visible);
  return visible?.width ?? 0;
}

export function renderShape(renderer: Renderer, shape: Shape) {
  if (!shape.visible) return;

  switch (shape.type) {
    case 'rectangle': {
      const hasIndependentCorners =
        shape.cornerRadiusTL !== undefined ||
        shape.cornerRadiusTR !== undefined ||
        shape.cornerRadiusBL !== undefined ||
        shape.cornerRadiusBR !== undefined;
      const radii: number | [number, number, number, number] = hasIndependentCorners
        ? [
            shape.cornerRadiusTL ?? shape.cornerRadius,
            shape.cornerRadiusTR ?? shape.cornerRadius,
            shape.cornerRadiusBR ?? shape.cornerRadius,
            shape.cornerRadiusBL ?? shape.cornerRadius,
          ]
        : shape.cornerRadius;
      renderer.drawRect(getTransform(shape), getStyle(shape), radii);
      break;
    }
    case 'ellipse': {
      renderer.drawEllipse(getTransform(shape), getStyle(shape));
      break;
    }
    case 'frame': {
      renderer.drawRect(getTransform(shape), getStyle(shape), 0);
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
      });
      break;
    }
    case 'path': {
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
          opacity: shape.opacity,
        });
      }
      break;
    }
    case 'line': {
      const linePoints: Array<[number, number]> = [
        [shape.x1, shape.y1],
        [shape.x2, shape.y2],
      ];
      renderer.drawPath(
        linePoints,
        {
          fills: [],
          strokes: shape.strokes,
          opacity: shape.opacity,
        },
        false,
      );
      break;
    }
    case 'polygon': {
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
    case 'arrow': {
      const shaftPoints: Array<[number, number]> = [
        [shape.x1, shape.y1],
        [shape.x2, shape.y2],
      ];
      const arrowStyle: RenderStyle = {
        fills: [],
        strokes: shape.strokes,
        opacity: shape.opacity,
      };
      renderer.drawPath(shaftPoints, arrowStyle, false);

      const sw = primaryStrokeWidth(shape.strokes);
      if (shape.endArrowhead) {
        const head = computeArrowHead(shape.x2, shape.y2, shape.x1, shape.y1, sw);
        renderer.drawPath([head.left, head.tip, head.right], arrowStyle, false);
      }

      if (shape.startArrowhead) {
        const head = computeArrowHead(shape.x1, shape.y1, shape.x2, shape.y2, sw);
        renderer.drawPath([head.left, head.tip, head.right], arrowStyle, false);
      }
      break;
    }
    case 'image': {
      renderer.drawRect(
        getTransform(shape),
        simpleStyle({ fill: '#E0E0E0', stroke: '#BDBDBD', strokeWidth: 1, opacity: shape.opacity }),
        0,
      );
      break;
    }
    case 'group': {
      break;
    }
  }
}

export function renderSelectionForShape(renderer: Renderer, shape: Shape) {
  if (shape.type === 'line' || shape.type === 'arrow') {
    const s = shape as Shape & { x1: number; y1: number; x2: number; y2: number };
    renderer.drawPath(
      [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ],
      simpleStyle({ fill: null, stroke: '#0D99FF', strokeWidth: 2, opacity: 1 }),
      false,
    );
    return;
  }
  renderer.drawSelectionBox(shape.x, shape.y, shape.width, shape.height, shape.rotation);
}
