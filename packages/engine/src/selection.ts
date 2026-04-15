export {
  type HandlePosition,
  type SelectionHandle,
  type SelectionBounds,
  rotatePoint,
  buildHandles,
  isEndpointShape,
  getSelectionBounds,
  hitTestHandle,
  hitTestEdge,
  getResizeCursor,
  normalizeRect,
  getAnchorAndDrag,
  computeResize,
  computeRotation,
  HANDLE_SIZE_PX,
} from './selection-bounds';

export { alignShapes, distributeShapes } from './selection-alignment';
