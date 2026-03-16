import type { ExportAdapter, ExportResult } from '../types';
import type { InterchangeDocument } from '../interchange-format';
import { generateSvg } from './svg-generator';

export const SVG_EXPORT_ADAPTER_ID = 'svg-export';

export class SvgExportAdapter implements ExportAdapter {
  readonly id = SVG_EXPORT_ADAPTER_ID;
  readonly name = 'SVG';
  readonly platform = 'svg';
  readonly transport = 'clipboard' as const;
  readonly supportedFormats = ['svg'];

  export(doc: InterchangeDocument): ExportResult {
    const svg = generateSvg(doc);
    return {
      text: svg,
      html: svg,
      mimeType: 'image/svg+xml',
    };
  }
}
