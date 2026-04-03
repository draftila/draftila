import type { BrushSettings, Camera, PressurePoint } from '@draftila/shared';
import type { Renderer } from '@draftila/engine/renderer';
import { simpleStyle } from '@draftila/engine/renderer';
import {
  getRectangleTool,
  getEllipseTool,
  getFrameTool,
  getLineTool,
  getArrowTool,
  getPolygonTool,
  getStarTool,
  getTextTool,
  getPenTool,
  getPencilTool,
  getBrushTool,
} from '@draftila/engine/tools/tool-manager';
import {
  computeArrowheadGeometry,
  generatePolygonPoints,
  generateStarPoints,
} from '@draftila/engine/shape-renderer';
import getStroke from 'perfect-freehand';

function renderFreehandPreview(
  renderer: Renderer,
  points: PressurePoint[],
  brushSettings?: BrushSettings,
) {
  if (points.length < 2) return;

  const inputPoints = points.map((p) => [p.x, p.y, p.pressure] as [number, number, number]);
  const strokePoints = getStroke(inputPoints, {
    size: brushSettings?.size ?? 4,
    thinning: brushSettings?.thinning ?? 0.5,
    smoothing: brushSettings?.smoothing ?? 0.5,
    streamline: brushSettings?.streamline ?? 0.5,
    simulatePressure: brushSettings?.simulatePressure ?? true,
  });

  if (strokePoints.length > 0) {
    const outlinePoints = strokePoints.map((p) => [p[0]!, p[1]!] as [number, number]);
    renderer.drawPath(outlinePoints, simpleStyle({ fill: '#000000', opacity: 0.7 }));
  }
}

export function renderToolPreviews(renderer: Renderer, activeTool: string, camera: Camera) {
  const previewStroke = 1 / camera.zoom;

  const rectPreview = getRectangleTool().previewRect;
  if (activeTool === 'rectangle' && rectPreview) {
    renderer.drawRect(
      { ...rectPreview, rotation: 0 },
      simpleStyle({
        fill: '#D9D9D9',
        stroke: '#0D99FF',
        strokeWidth: previewStroke,
        opacity: 0.7,
      }),
      0,
    );
  }

  const ellipsePreview = getEllipseTool().previewRect;
  if (activeTool === 'ellipse' && ellipsePreview) {
    renderer.drawEllipse(
      { ...ellipsePreview, rotation: 0 },
      simpleStyle({
        fill: '#D9D9D9',
        stroke: '#0D99FF',
        strokeWidth: previewStroke,
        opacity: 0.7,
      }),
    );
  }

  const framePreview = getFrameTool().previewRect;
  if (activeTool === 'frame' && framePreview) {
    renderer.drawRect(
      { ...framePreview, rotation: 0 },
      simpleStyle({
        fill: '#FFFFFF',
        stroke: '#0D99FF',
        strokeWidth: previewStroke,
        opacity: 0.7,
      }),
      0,
    );
  }

  const linePreview = getLineTool().previewLine;
  if (activeTool === 'line' && linePreview) {
    renderer.drawPath(
      [
        [linePreview.x1, linePreview.y1],
        [linePreview.x2, linePreview.y2],
      ],
      simpleStyle({ stroke: '#000000', strokeWidth: 2, opacity: 0.7 }),
      false,
    );
  }

  const arrowPreview = getArrowTool().previewLine;
  if (activeTool === 'arrow' && arrowPreview) {
    const arrowPreviewRenderStyle = simpleStyle({
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 0.7,
    });
    renderer.drawPath(
      [
        [arrowPreview.x1, arrowPreview.y1],
        [arrowPreview.x2, arrowPreview.y2],
      ],
      arrowPreviewRenderStyle,
      false,
    );
    const headGeom = computeArrowheadGeometry(
      arrowPreview.x2,
      arrowPreview.y2,
      arrowPreview.x1,
      arrowPreview.y1,
      2,
      'line_arrow',
    );
    if (headGeom) {
      renderer.drawPath(headGeom.points, arrowPreviewRenderStyle, false);
    }
  }

  const polygonPreview = getPolygonTool().previewRect;
  if (activeTool === 'polygon' && polygonPreview) {
    const cx = polygonPreview.x + polygonPreview.width / 2;
    const cy = polygonPreview.y + polygonPreview.height / 2;
    const pts = generatePolygonPoints(
      cx,
      cy,
      polygonPreview.width / 2,
      polygonPreview.height / 2,
      6,
    );
    renderer.drawPath(
      pts,
      simpleStyle({
        fill: '#D9D9D9',
        stroke: '#0D99FF',
        strokeWidth: previewStroke,
        opacity: 0.7,
      }),
    );
  }

  const starPreview = getStarTool().previewRect;
  if (activeTool === 'star' && starPreview) {
    const cx = starPreview.x + starPreview.width / 2;
    const cy = starPreview.y + starPreview.height / 2;
    const pts = generateStarPoints(cx, cy, starPreview.width / 2, starPreview.height / 2, 5, 0.38);
    renderer.drawPath(
      pts,
      simpleStyle({
        fill: '#D9D9D9',
        stroke: '#0D99FF',
        strokeWidth: previewStroke,
        opacity: 0.7,
      }),
    );
  }

  const textPreview = getTextTool().previewRect;
  if (activeTool === 'text' && textPreview) {
    renderer.drawRect(
      { ...textPreview, rotation: 0 },
      simpleStyle({ stroke: '#0D99FF', strokeWidth: previewStroke, opacity: 0.5 }),
      0,
    );
  }

  const penTool = getPenTool();
  const pencilTool = getPencilTool();
  const brushTool = getBrushTool();

  if (activeTool === 'brush') {
    renderFreehandPreview(renderer, brushTool.currentPoints, brushTool.brushSettings);
  }

  if (activeTool === 'pencil') {
    renderFreehandPreview(renderer, pencilTool.currentPoints);
  }

  if (activeTool === 'pen') {
    renderFreehandPreview(renderer, penTool.getFreehandPoints());

    const previewPath = penTool.getPreviewPathData();
    if (previewPath) {
      renderer.drawSvgPath(
        { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        previewPath,
        simpleStyle({ stroke: '#0D99FF', strokeWidth: 1 / camera.zoom, opacity: 0.9 }),
        'nonzero',
      );
    }

    for (const node of penTool.getPlacedNodes()) {
      renderer.drawPathNode(node.x, node.y, camera.zoom, false);
    }
  }
}
