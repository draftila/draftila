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
  getShape,
  getAllShapes,
  getShapeCount,
  observeShapes,
  type ShapeChangeCallback,
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
  type ArrowHeadPoints,
  computeArrowHead,
  generatePolygonPoints,
  generateStarPoints,
  renderShape,
  renderSelectionForShape,
} from './shape-renderer';

export { hitTestPoint, hitTestRect } from './hit-test';

export { type ShapeBBox, SpatialIndex } from './spatial-index';

export { type SnapLine, type DistanceIndicator, type SnapResult, snapPosition } from './snap';

export { initUndoManager, undo, redo, canUndo, canRedo, destroyUndoManager } from './history';

export {
  copyShapes,
  pasteShapes,
  cutShapes,
  duplicateShapes,
  hasClipboardContent,
} from './clipboard';

export {
  type FigmaMeta,
  type PasteSource,
  isFigmaClipboard,
  parseFigmaMeta,
  parseFigmaBinary,
  importSvgShapes,
  detectPasteSource,
  handlePaste,
  shapesToSvg,
} from './figma-clipboard';

export {
  type BooleanOperation,
  type BooleanResult,
  computeBooleanBounds,
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
  type LayoutDirection,
  type LayoutAlign,
  type SizingMode,
  type AutoLayoutConfig,
  DEFAULT_AUTO_LAYOUT,
  computeAutoLayout,
  computeHugSize,
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
  getComponentsMap,
  createComponent,
  createInstance,
  listComponents,
} from './components';

export { type PageData, initPages, getPages, addPage, removePage, renamePage } from './pages';

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
export { LineTool } from './tools/line-tool';
export { ArrowTool } from './tools/arrow-tool';
export { PolygonTool } from './tools/polygon-tool';
export { StarTool } from './tools/star-tool';
