import type { InterchangeDocument } from './interchange-format';

export type AdapterTransport = 'clipboard' | 'file' | 'api';

export interface ImportData {
  html?: string | null;
  text?: string | null;
  files?: File[];
  url?: string;
}

export interface ExportResult {
  blob?: Blob;
  text?: string;
  html?: string;
  mimeType: string;
}

export interface ImportAdapter {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly transport: AdapterTransport;
  canImport(data: ImportData): boolean;
  import(data: ImportData): InterchangeDocument;
}

export interface ExportAdapter {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly transport: AdapterTransport;
  readonly supportedFormats: string[];
  export(doc: InterchangeDocument): ExportResult;
}
