import { describe, test, expect, beforeEach } from 'bun:test';
import {
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
} from '../../src/interchange/registry';
import type { ImportAdapter, ExportAdapter } from '../../src/interchange/types';
import { createInterchangeDocument } from '../../src/interchange/interchange-format';

function createMockImport(overrides: Partial<ImportAdapter> = {}): ImportAdapter {
  return {
    id: 'mock-import',
    name: 'Mock Import',
    platform: 'mock',
    transport: 'clipboard',
    canImport: () => false,
    import: () => createInterchangeDocument([], { source: 'mock' }),
    ...overrides,
  };
}

function createMockExport(overrides: Partial<ExportAdapter> = {}): ExportAdapter {
  return {
    id: 'mock-export',
    name: 'Mock Export',
    platform: 'mock',
    transport: 'clipboard',
    supportedFormats: ['svg'],
    export: () => ({ text: '', mimeType: 'text/plain' }),
    ...overrides,
  };
}

describe('AdapterRegistry', () => {
  beforeEach(() => {
    clearAdapters();
  });

  describe('registerImportAdapter', () => {
    test('registers an import adapter', () => {
      const adapter = createMockImport();
      registerImportAdapter(adapter);
      expect(getImportAdapters()).toHaveLength(1);
      expect(getImportAdapters()[0]!.id).toBe('mock-import');
    });

    test('replaces adapter with same id', () => {
      registerImportAdapter(createMockImport({ name: 'First' }));
      registerImportAdapter(createMockImport({ name: 'Second' }));
      expect(getImportAdapters()).toHaveLength(1);
      expect(getImportAdapters()[0]!.name).toBe('Second');
    });

    test('registers multiple adapters with different ids', () => {
      registerImportAdapter(createMockImport({ id: 'a' }));
      registerImportAdapter(createMockImport({ id: 'b' }));
      expect(getImportAdapters()).toHaveLength(2);
    });
  });

  describe('registerExportAdapter', () => {
    test('registers an export adapter', () => {
      const adapter = createMockExport();
      registerExportAdapter(adapter);
      expect(getExportAdapters()).toHaveLength(1);
    });

    test('replaces adapter with same id', () => {
      registerExportAdapter(createMockExport({ name: 'First' }));
      registerExportAdapter(createMockExport({ name: 'Second' }));
      expect(getExportAdapters()).toHaveLength(1);
      expect(getExportAdapters()[0]!.name).toBe('Second');
    });
  });

  describe('unregisterImportAdapter', () => {
    test('removes a registered adapter', () => {
      registerImportAdapter(createMockImport());
      unregisterImportAdapter('mock-import');
      expect(getImportAdapters()).toHaveLength(0);
    });

    test('does nothing for unknown id', () => {
      registerImportAdapter(createMockImport());
      unregisterImportAdapter('unknown');
      expect(getImportAdapters()).toHaveLength(1);
    });
  });

  describe('unregisterExportAdapter', () => {
    test('removes a registered adapter', () => {
      registerExportAdapter(createMockExport());
      unregisterExportAdapter('mock-export');
      expect(getExportAdapters()).toHaveLength(0);
    });
  });

  describe('getImportAdapterById', () => {
    test('finds adapter by id', () => {
      registerImportAdapter(createMockImport());
      expect(getImportAdapterById('mock-import')).toBeDefined();
    });

    test('returns undefined for unknown id', () => {
      expect(getImportAdapterById('unknown')).toBeUndefined();
    });
  });

  describe('getExportAdapterById', () => {
    test('finds adapter by id', () => {
      registerExportAdapter(createMockExport());
      expect(getExportAdapterById('mock-export')).toBeDefined();
    });

    test('returns undefined for unknown id', () => {
      expect(getExportAdapterById('unknown')).toBeUndefined();
    });
  });

  describe('getImportAdaptersByPlatform', () => {
    test('filters by platform', () => {
      registerImportAdapter(createMockImport({ id: 'a', platform: 'figma' }));
      registerImportAdapter(createMockImport({ id: 'b', platform: 'svg' }));
      registerImportAdapter(createMockImport({ id: 'c', platform: 'figma' }));
      expect(getImportAdaptersByPlatform('figma')).toHaveLength(2);
      expect(getImportAdaptersByPlatform('svg')).toHaveLength(1);
      expect(getImportAdaptersByPlatform('unknown')).toHaveLength(0);
    });
  });

  describe('getExportAdaptersByPlatform', () => {
    test('filters by platform', () => {
      registerExportAdapter(createMockExport({ id: 'a', platform: 'figma' }));
      registerExportAdapter(createMockExport({ id: 'b', platform: 'svg' }));
      expect(getExportAdaptersByPlatform('figma')).toHaveLength(1);
    });
  });

  describe('detectImportAdapter', () => {
    test('finds first adapter that can import', () => {
      registerImportAdapter(
        createMockImport({ id: 'a', canImport: (d) => !!d.text?.includes('hello') }),
      );
      registerImportAdapter(
        createMockImport({ id: 'b', canImport: (d) => !!d.html?.includes('<svg') }),
      );

      const result = detectImportAdapter({ text: 'hello world' });
      expect(result?.id).toBe('a');
    });

    test('returns undefined when no adapter matches', () => {
      registerImportAdapter(createMockImport({ canImport: () => false }));
      expect(detectImportAdapter({ text: 'nothing' })).toBeUndefined();
    });
  });

  describe('clearAdapters', () => {
    test('removes all adapters', () => {
      registerImportAdapter(createMockImport());
      registerExportAdapter(createMockExport());
      clearAdapters();
      expect(getImportAdapters()).toHaveLength(0);
      expect(getExportAdapters()).toHaveLength(0);
    });
  });
});
