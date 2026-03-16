import type { ExportAdapter, ExportResult } from '../types';
import type { InterchangeDocument } from '../interchange-format';
import { interchangeToShapeData } from '../converter';
import { generateSvg } from '../svg/svg-generator';

export const DRAFTILA_EXPORT_ADAPTER_ID = 'draftila-clipboard-export';

export class DraftilaClipboardExportAdapter implements ExportAdapter {
  readonly id = DRAFTILA_EXPORT_ADAPTER_ID;
  readonly name = 'Draftila (Clipboard)';
  readonly platform = 'draftila';
  readonly transport = 'clipboard' as const;
  readonly supportedFormats = ['json', 'svg'];

  export(doc: InterchangeDocument): ExportResult {
    const shapeData = interchangeToShapeData(doc);
    const shapes = shapeData.map((s) => ({
      id: '',
      type: s.type,
      ...s.props,
    }));

    const json = JSON.stringify({ type: 'draftila/shapes', shapes });
    const svg = generateSvg(doc);
    const html = `${svg}\n<!-- draftila:${btoa(json)} -->`;

    return {
      text: json,
      html,
      mimeType: 'application/json',
    };
  }
}
