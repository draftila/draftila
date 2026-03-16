import type { Shape } from '@draftila/shared';
import type { ImportAdapter, ImportData } from '../types';
import type { InterchangeDocument } from '../interchange-format';
import { createInterchangeDocument } from '../interchange-format';
import { shapesToInterchange } from '../converter';

export const DRAFTILA_IMPORT_ADAPTER_ID = 'draftila-clipboard';

const DRAFTILA_HTML_MARKER = '<!-- draftila:';

export class DraftilaClipboardImportAdapter implements ImportAdapter {
  readonly id = DRAFTILA_IMPORT_ADAPTER_ID;
  readonly name = 'Draftila (Clipboard)';
  readonly platform = 'draftila';
  readonly transport = 'clipboard' as const;

  canImport(data: ImportData): boolean {
    if (data.html && data.html.includes(DRAFTILA_HTML_MARKER)) return true;

    if (data.text) {
      try {
        const parsed = JSON.parse(data.text);
        return parsed.type === 'draftila/shapes';
      } catch {
        return false;
      }
    }

    return false;
  }

  import(data: ImportData): InterchangeDocument {
    if (data.html && data.html.includes(DRAFTILA_HTML_MARKER)) {
      const match = data.html.match(/<!-- draftila:([A-Za-z0-9+/=]+) -->/);
      if (match?.[1]) {
        try {
          const json = atob(match[1]);
          const parsed = JSON.parse(json);
          if (parsed.type === 'draftila/shapes' && Array.isArray(parsed.shapes)) {
            return shapesToInterchange(parsed.shapes as Shape[], 'draftila');
          }
        } catch {
          // Fall through to text parsing
        }
      }
    }

    if (data.text) {
      try {
        const parsed = JSON.parse(data.text);
        if (parsed.type === 'draftila/shapes' && Array.isArray(parsed.shapes)) {
          return shapesToInterchange(parsed.shapes as Shape[], 'draftila');
        }
      } catch {
        // Not valid
      }
    }

    return createInterchangeDocument([], { source: 'draftila' });
  }
}
