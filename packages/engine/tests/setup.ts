import { parseHTML } from 'linkedom';

const { document, DOMParser } = parseHTML('<!DOCTYPE html><html><body></body></html>');

globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
globalThis.document = document as unknown as typeof globalThis.document;

globalThis.CSS = {
  escape: (s: string) => s.replace(/([^\w-])/g, '\\$1'),
  supports: () => false,
} as unknown as typeof globalThis.CSS;
