export type {
  LayerTreeNode,
  StackMoveDirection,
  LayerDropPlacement,
  ShapeChangeCallback,
} from './scene-graph/types';

export { getShapesMap, getZOrder } from './scene-graph/hierarchy';

export {
  initDocument,
  getShape,
  getAllShapes,
  getChildShapes,
  getShapeCount,
  addShape,
  updateShape,
  deleteShape,
  deleteShapes,
} from './scene-graph/shape-crud';

export {
  getLayerTree,
  getTopLevelSelectedShapeIds,
  getExpandedShapeIds,
  getDescendantShapeIds,
  resolveGroupTarget,
  findContainerAtPoint,
  getSelectedContainer,
} from './scene-graph/query-ops';

export { groupShapes, ungroupShapes, frameSelection } from './scene-graph/grouping-ops';

export {
  moveShapesInStack,
  moveShapesByDrop,
  nudgeShapes,
  flipShapes,
} from './scene-graph/move-ops';

export { canApplyBooleanOperation, applyBooleanOperation } from './scene-graph/boolean-shape-ops';

export {
  applyAutoLayout,
  applyAutoLayoutForAncestors,
  reorderAutoLayoutChildren,
  computeAutoLayoutPreview,
  computeAutoLayoutResizePreview,
} from './scene-graph/layout-ops';

export { observeShapes } from './scene-graph/observe';
