import type { ImportAdapter, ImportData } from '../types';
import type { InterchangeDocument } from '../interchange-format';
import { createInterchangeDocument } from '../interchange-format';
import { parseSvg, extractSvgFromHtml } from './svg-parser';

export const SVG_IMPORT_ADAPTER_ID = 'svg-clipboard';
export const SVG_FILE_IMPORT_ADAPTER_ID = 'svg-file';

export class SvgClipboardImportAdapter implements ImportAdapter {
  readonly id = SVG_IMPORT_ADAPTER_ID;
  readonly name = 'SVG (Clipboard)';
  readonly platform = 'svg';
  readonly transport = 'clipboard' as const;

  canImport(data: ImportData): boolean {
    if (data.html) {
      return /<svg[\s\S]*?<\/svg>/i.test(data.html);
    }
    if (data.text) {
      return data.text.trim().startsWith('<svg');
    }
    return false;
  }

  import(data: ImportData): InterchangeDocument {
    const svgString = data.html
      ? extractSvgFromHtml(data.html)
      : data.text?.trim().startsWith('<svg')
        ? data.text
        : null;

    if (!svgString) {
      return createInterchangeDocument([], { source: 'svg' });
    }

    return parseSvg(svgString, { mode: 'editable' });
  }
}

export class SvgFileImportAdapter implements ImportAdapter {
  readonly id = SVG_FILE_IMPORT_ADAPTER_ID;
  readonly name = 'SVG (File)';
  readonly platform = 'svg';
  readonly transport = 'file' as const;

  canImport(data: ImportData): boolean {
    if (!data.files || data.files.length === 0) return false;
    return data.files.some((f) => f.type === 'image/svg+xml' || f.name.endsWith('.svg'));
  }

  import(data: ImportData): InterchangeDocument {
    return createInterchangeDocument([], { source: 'svg' });
  }
}

export async function importSvgFile(file: File): Promise<InterchangeDocument> {
  const text = await file.text();
  return parseSvg(text, { mode: 'editable' });
}
