export {
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_CAMERA,
  screenToCanvas,
  canvasToScreen,
  getViewportBounds,
  clampZoom,
  zoomAtPoint,
  panCamera,
  zoomToFit,
  getZoomPercentage,
} from './camera';

export {
  initDocument,
  getShapesMap,
  getZOrder,
  addShape,
  updateShape,
  deleteShape,
  deleteShapes,
  groupShapes,
  ungroupShapes,
  moveShapesInStack,
  moveShapesByDrop,
  getLayerTree,
  getTopLevelSelectedShapeIds,
  getExpandedShapeIds,
  resolveGroupTarget,
  getDescendantShapeIds,
  nudgeShapes,
  flipShapes,
  frameSelection,
  getShape,
  getAllShapes,
  getShapeCount,
  findContainerAtPoint,
  getSelectedContainer,
  type LayerTreeNode,
  type StackMoveDirection,
  type LayerDropPlacement,
  observeShapes,
  type ShapeChangeCallback,
  getChildShapes,
  applyAutoLayout,
  applyAutoLayoutForAncestors,
  applyBooleanOperation,
} from './scene-graph';

export {
  type HandlePosition,
  type SelectionHandle,
  type SelectionBounds,
  getSelectionBounds,
  isEndpointShape,
  hitTestHandle,
  getResizeCursor,
  computeResize,
  computeRotation,
  alignShapes,
  distributeShapes,
  HANDLE_SIZE_PX,
} from './selection';

export {
  type RenderStyle,
  type RenderTransform,
  type TextRenderOptions,
  type Renderer,
  simpleStyle,
  solidFill,
  solidStroke,
} from './renderer/types';

export { Canvas2DRenderer } from './renderer/canvas2d-renderer';

export {
  type ArrowheadGeometry,
  computeArrowheadGeometry,
  generatePolygonPoints,
  generateStarPoints,
  renderShape,
  renderSelectionForShape,
} from './shape-renderer';

export { hitTestPoint, hitTestRect } from './hit-test';

export { type ShapeBBox, SpatialIndex } from './spatial-index';

export {
  type SnapLine,
  type DistanceIndicator,
  type SnapResult,
  type ParentFrameRect,
  type ResizeSnapEdges,
  type ResizeSnapResult,
  type GuideSnapTarget,
  snapPosition,
  snapResize,
} from './snap';

export { initUndoManager, undo, redo, canUndo, canRedo, destroyUndoManager } from './history';

export {
  copyShapes,
  pasteShapes,
  cutShapes,
  duplicateShapes,
  duplicateShapesInPlace,
  copyStyle,
  pasteStyle,
  hasClipboardContent,
  hasStyleClipboardContent,
} from './clipboard';

export {
  type PasteSource,
  type ExternalPasteOptions,
  importSvgShapes,
  detectPasteSource,
  handlePaste,
  shapesToSvg,
} from './shape-import';

export {
  type BooleanOperation,
  type BooleanResult,
  computePathBoolean,
  rectIntersects,
  rectUnion,
  rectIntersection,
} from './boolean-ops';

export {
  getCachedImage,
  preloadImage,
  clearImageCache,
  addImageFromFile,
  addImageFromUrl,
  handleFileDrop,
} from './image-manager';

export {
  type LayoutChild,
  type LayoutResult,
  isAutoLayoutFrame,
  getAutoLayoutConfig,
  computeAutoLayout,
} from './auto-layout';

export {
  type HorizontalConstraint,
  type VerticalConstraint,
  type Constraints,
  DEFAULT_CONSTRAINTS,
  applyConstraints,
} from './constraints';

export {
  type ComponentDefinition,
  type ComponentInstanceInfo,
  getComponentsMap,
  getComponentInstancesMap,
  createComponent,
  createInstance,
  listComponents,
  removeComponent,
  renameComponent,
  getComponentById,
  getInstanceComponentId,
  isComponentInstance,
  listComponentInstances,
  observeComponents,
} from './components';

export {
  type PageData,
  initPages,
  ensureDefaultPage,
  getPages,
  addPage,
  removePage,
  renamePage,
  setActivePage,
  getActivePageId,
  observePages,
  setPageBackgroundColor,
  getPageBackgroundColor,
  DEFAULT_PAGE_BACKGROUND,
} from './pages';

export {
  getPageGuides,
  addGuide,
  updateGuidePosition,
  removeGuide,
  removeAllGuides,
  observeGuides,
  hitTestGuide,
  setActivePageForGuides,
  getActivePageGuidesArray,
} from './guides';

export {
  exportToPng,
  exportToSvg,
  downloadBlob,
  downloadSvg,
  exportAndDownloadPng,
  exportAndDownloadSvg,
} from './export';

export {
  type ToolStore,
  type ToolContext,
  type ToolResult,
  BaseTool,
  configureToolStore,
  getToolStore,
} from './tools/base-tool';

export {
  getTool,
  getMoveTool,
  getRectangleTool,
  getEllipseTool,
  getFrameTool,
  getPenTool,
  getNodeTool,
  getLineTool,
  getArrowTool,
  getPolygonTool,
  getStarTool,
  getTextTool,
  setTextToolCallback,
} from './tools/tool-manager';

export { type ResizePreviewEntry, MoveTool } from './tools/move-tool';
export { HandTool } from './tools/hand-tool';
export { RectangleTool } from './tools/rectangle-tool';
export { EllipseTool } from './tools/ellipse-tool';
export { FrameTool } from './tools/frame-tool';
export { TextTool } from './tools/text-tool';
export { PenTool } from './tools/pen-tool';
export { type SelectedNode, type DragTarget, NodeTool } from './tools/node-tool';
export { LineTool } from './tools/line-tool';
export { ArrowTool } from './tools/arrow-tool';
export { PolygonTool } from './tools/polygon-tool';
export { StarTool } from './tools/star-tool';

export {
  ensureFontsLoaded,
  onFontsLoaded,
  collectFontFamilies,
  resolveCanvasFontFamily,
} from './font-manager';

export {
  type GoogleFont,
  ALL_FONTS,
  loadFontPreviews,
  isFontPreviewReady,
  subscribePreviewLoads,
} from './google-fonts';

export {
  rectToPath,
  ellipseToPath,
  polygonToPath,
  starToPath,
  lineToPath,
  arrowToPath,
  transformPath,
  getPathBounds,
  normalizePathToOrigin,
} from './path-gen';

export {
  svgPathToVectorNodes,
  vectorNodesToSvgPath,
  updateVectorNode,
  addNodeToSubpath,
  deleteNodeFromSubpath,
} from './vector-nodes';

export {
  computeTextAutoResizeDimensions,
  applyTextAutoResize,
  setTextMeasureEnabled,
} from './text-measure';
