export type {
  AdapterTransport,
  ImportData,
  ExportResult,
  ImportAdapter,
  ExportAdapter,
} from './types';

export type {
  InterchangeNodeType,
  InterchangeFill,
  InterchangeGradientStop,
  InterchangeGradient,
  InterchangeStrokeCap,
  InterchangeStrokeJoin,
  InterchangeStrokeAlign,
  InterchangeDashPattern,
  InterchangeStroke,
  InterchangeShadow,
  InterchangeBlur,
  InterchangePathPoint,
  InterchangeClipPath,
  InterchangeNode,
  InterchangeMetadata,
  InterchangeDocument,
} from './interchange-format';
export { createInterchangeNode, createInterchangeDocument } from './interchange-format';

export {
  registerImportAdapter,
  registerExportAdapter,
  unregisterImportAdapter,
  unregisterExportAdapter,
  getImportAdapters,
  getExportAdapters,
  getImportAdapterById,
  getExportAdapterById,
  getImportAdaptersByPlatform,
  getExportAdaptersByPlatform,
  detectImportAdapter,
  clearAdapters,
} from './registry';

export { shapesToInterchange, interchangeToShapeData, type ConvertedShape } from './converter';

export { parseSvg, extractSvgFromHtml } from './svg/svg-parser';
export { generateSvg } from './svg/svg-generator';
export {
  SvgClipboardImportAdapter,
  SvgFileImportAdapter,
  importSvgFile,
} from './svg/svg-import-adapter';
export { SvgExportAdapter } from './svg/svg-export-adapter';

export { DraftilaClipboardImportAdapter } from './draftila/draftila-import-adapter';
export { DraftilaClipboardExportAdapter } from './draftila/draftila-export-adapter';

export {
  parseTransform,
  decomposeTransform,
  normalizeColor,
  colorToOpacity,
  parseLength,
  parseSvgPathData,
  pathCommandsToBounds,
  type TransformMatrix,
  type PathCommand,
} from './svg/svg-utils';

import { registerImportAdapter, registerExportAdapter } from './registry';
import { SvgClipboardImportAdapter, SvgFileImportAdapter } from './svg/svg-import-adapter';
import { SvgExportAdapter } from './svg/svg-export-adapter';
import { DraftilaClipboardImportAdapter } from './draftila/draftila-import-adapter';
import { DraftilaClipboardExportAdapter } from './draftila/draftila-export-adapter';

let initialized = false;

export function initializeDefaultAdapters(): void {
  if (initialized) return;
  initialized = true;

  registerImportAdapter(new DraftilaClipboardImportAdapter());
  registerImportAdapter(new SvgClipboardImportAdapter());
  registerImportAdapter(new SvgFileImportAdapter());

  registerExportAdapter(new DraftilaClipboardExportAdapter());
  registerExportAdapter(new SvgExportAdapter());
}

export function resetAdapters(): void {
  initialized = false;
}
