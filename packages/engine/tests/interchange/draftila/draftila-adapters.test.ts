import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import { DraftilaClipboardImportAdapter } from '../../../src/interchange/draftila/draftila-import-adapter';
import { DraftilaClipboardExportAdapter } from '../../../src/interchange/draftila/draftila-export-adapter';
import {
  createInterchangeNode,
  createInterchangeDocument,
} from '../../../src/interchange/interchange-format';

describe('DraftilaClipboardImportAdapter', () => {
  const adapter = new DraftilaClipboardImportAdapter();

  test('has correct id and platform', () => {
    expect(adapter.id).toBe('draftila-clipboard');
    expect(adapter.platform).toBe('draftila');
    expect(adapter.transport).toBe('clipboard');
  });

  test('canImport detects draftila JSON in text', () => {
    const shapes: Partial<Shape>[] = [
      { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100 },
    ];
    const text = JSON.stringify({ type: 'draftila/shapes', shapes });
    expect(adapter.canImport({ text })).toBe(true);
  });

  test('canImport detects draftila HTML marker', () => {
    const html = '<svg></svg>\n<!-- draftila:abc123== -->';
    expect(adapter.canImport({ html })).toBe(true);
  });

  test('canImport rejects random text', () => {
    expect(adapter.canImport({ text: 'hello world' })).toBe(false);
  });

  test('canImport rejects empty data', () => {
    expect(adapter.canImport({})).toBe(false);
  });

  test('imports from text JSON', () => {
    const shapes = [
      {
        id: 'r1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        parentId: null,
        opacity: 1,
        locked: false,
        visible: true,
        name: 'Rect',
        blendMode: 'normal',
        fills: [{ color: '#FF0000', opacity: 1, visible: true }],
        strokes: [],
        cornerRadius: 0,
        cornerSmoothing: 0,
        shadows: [],
        blurs: [],
      },
    ];
    const text = JSON.stringify({ type: 'draftila/shapes', shapes });
    const doc = adapter.import({ text });
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.type).toBe('rectangle');
    expect(doc.nodes[0]!.x).toBe(10);
  });

  test('imports from HTML marker', () => {
    const shapes = [
      {
        id: 'r1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        parentId: null,
        opacity: 1,
        locked: false,
        visible: true,
        name: '',
        blendMode: 'normal',
        fills: [{ color: '#FF0000', opacity: 1, visible: true }],
        strokes: [],
        cornerRadius: 0,
        cornerSmoothing: 0,
        shadows: [],
        blurs: [],
      },
    ];
    const json = JSON.stringify({ type: 'draftila/shapes', shapes });
    const html = `<svg></svg>\n<!-- draftila:${btoa(json)} -->`;
    const doc = adapter.import({ html });
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.type).toBe('rectangle');
  });

  test('returns empty doc for invalid data', () => {
    const doc = adapter.import({ text: 'not json' });
    expect(doc.nodes).toHaveLength(0);
  });
});

describe('DraftilaClipboardExportAdapter', () => {
  const adapter = new DraftilaClipboardExportAdapter();

  test('has correct id and platform', () => {
    expect(adapter.id).toBe('draftila-clipboard-export');
    expect(adapter.platform).toBe('draftila');
  });

  test('exports interchange document as JSON + HTML', () => {
    const doc = createInterchangeDocument(
      [
        createInterchangeNode('rectangle', {
          x: 10,
          y: 20,
          width: 100,
          height: 50,
          fills: [{ color: '#FF0000', opacity: 1, visible: true }],
        }),
      ],
      { source: 'draftila' },
    );

    const result = adapter.export(doc);
    expect(result.mimeType).toBe('application/json');

    const parsed = JSON.parse(result.text!);
    expect(parsed.type).toBe('draftila/shapes');
    expect(parsed.shapes).toHaveLength(1);

    expect(result.html).toContain('<svg');
    expect(result.html).toContain('draftila:');
  });
});
