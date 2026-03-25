import type { Shape } from '@draftila/shared';
import type { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import type { NodeTool } from '@draftila/engine';

export function renderNodeEditing(
  renderer: Canvas2DRenderer,
  camera: { zoom: number },
  nodeTool: NodeTool,
  shapeMap: ReadonlyMap<string, Shape>,
) {
  const editingShapeId = nodeTool.getEditingShapeId();
  const editingShape = editingShapeId ? shapeMap.get(editingShapeId) : null;
  if (!editingShape) return;

  const subpaths = nodeTool.getSubpaths();
  const midpointHandles = nodeTool.getMidpointHandles();
  const selectedNodes = nodeTool.selectedNodes;
  const selectedNodeSet = new Set(selectedNodes.map((n) => `${n.subpathIndex}:${n.nodeIndex}`));

  for (const midpoint of midpointHandles) {
    renderer.drawBezierHandle(
      editingShape.x + midpoint.x,
      editingShape.y + midpoint.y,
      camera.zoom,
    );
  }

  for (let subpathIndex = 0; subpathIndex < subpaths.length; subpathIndex++) {
    const subpath = subpaths[subpathIndex];
    if (!subpath) continue;
    for (let nodeIndex = 0; nodeIndex < subpath.nodes.length; nodeIndex++) {
      const node = subpath.nodes[nodeIndex];
      if (!node) continue;

      const anchorX = editingShape.x + node.x;
      const anchorY = editingShape.y + node.y;

      const handleInX = anchorX + node.handleInX;
      const handleInY = anchorY + node.handleInY;
      if (node.handleInX !== 0 || node.handleInY !== 0) {
        renderer.drawControlLine(anchorX, anchorY, handleInX, handleInY, camera.zoom);
        renderer.drawBezierHandle(handleInX, handleInY, camera.zoom);
      }

      const handleOutX = anchorX + node.handleOutX;
      const handleOutY = anchorY + node.handleOutY;
      if (node.handleOutX !== 0 || node.handleOutY !== 0) {
        renderer.drawControlLine(anchorX, anchorY, handleOutX, handleOutY, camera.zoom);
        renderer.drawBezierHandle(handleOutX, handleOutY, camera.zoom);
      }

      const isSelected = selectedNodeSet.has(`${subpathIndex}:${nodeIndex}`);
      renderer.drawPathNode(anchorX, anchorY, camera.zoom, isSelected);
    }
  }
}
