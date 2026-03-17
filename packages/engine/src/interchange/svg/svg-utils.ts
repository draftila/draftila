export type { TransformMatrix } from './transform';
export { IDENTITY_MATRIX, multiplyMatrices, parseTransform, decomposeTransform } from './transform';

export { normalizeColor, colorToOpacity } from './color';

export { parseLength, parseCssInlineStyle, parseCssStyleSheet, getEffectiveAttribute } from './css';

export type { PathCommand } from './path';
export {
  parseSvgPathData,
  normalizePathToAbsolute,
  pathCommandsToBounds,
  translateSvgPathData,
  scaleSvgPathData,
  transformPathCommands,
  pathCommandsToString,
} from './path';

export {
  rectToPathCommands,
  ellipseToPathCommands,
  lineToPathCommands,
  polygonToPathCommands,
  polylineToPathCommands,
} from './shapes';
