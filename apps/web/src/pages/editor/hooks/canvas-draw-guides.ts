import type { Camera } from '@draftila/shared';
import type { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import {
  getMoveTool,
  getRectangleTool,
  getEllipseTool,
  getFrameTool,
  getLineTool,
  getArrowTool,
  getPolygonTool,
  getStarTool,
  getTextTool,
} from '@draftila/engine/tools/tool-manager';
import type { useEditorStore } from '@/stores/editor-store';

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

export function renderGuides(
  renderer: Canvas2DRenderer,
  camera: Camera,
  guideState: Pick<
    EditorStoreState,
    'guides' | 'selectedGuideId' | 'draggingGuide' | 'guidesVisible'
  >,
) {
  const { guides, selectedGuideId, draggingGuide, guidesVisible } = guideState;
  const guideViewport = renderer.getViewport(camera);

  if (guidesVisible) {
    for (const guide of guides) {
      renderer.drawGuide(
        guide.axis,
        guide.position,
        guideViewport,
        camera.zoom,
        guide.id === selectedGuideId,
      );
    }

    if (selectedGuideId) {
      const selectedGuide = guides.find((g) => g.id === selectedGuideId);
      if (selectedGuide) {
        renderer.drawGuidePositionLabel(selectedGuide.axis, selectedGuide.position, camera.zoom);
      }
    }
  }

  if (draggingGuide) {
    renderer.drawGuide(
      draggingGuide.axis,
      draggingGuide.position,
      guideViewport,
      camera.zoom,
      false,
    );
  }
}

export function renderSnapLinesAndDistanceIndicators(renderer: Canvas2DRenderer, zoom: number) {
  const moveTool = getMoveTool();

  for (const line of moveTool.getSnapLines()) {
    renderer.drawSnapLine(line.axis, line.position, line.start, line.end, zoom);
  }

  for (const indicator of moveTool.getDistanceIndicators()) {
    renderer.drawDistanceIndicator(
      indicator.axis,
      indicator.from,
      indicator.to,
      indicator.position,
      zoom,
    );
  }

  const drawingTools = [
    getRectangleTool(),
    getEllipseTool(),
    getFrameTool(),
    getPolygonTool(),
    getStarTool(),
    getLineTool(),
    getArrowTool(),
    getTextTool(),
  ] as const;

  for (const tool of drawingTools) {
    for (const line of tool.getSnapLines()) {
      renderer.drawSnapLine(line.axis, line.position, line.start, line.end, zoom);
    }
    for (const indicator of tool.getDistanceIndicators()) {
      renderer.drawDistanceIndicator(
        indicator.axis,
        indicator.from,
        indicator.to,
        indicator.position,
        zoom,
      );
    }
  }
}
