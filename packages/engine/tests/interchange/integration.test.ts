import { describe, test, expect, beforeEach } from 'bun:test';
import {
  initializeDefaultAdapters,
  resetAdapters,
  clearAdapters,
  getImportAdapters,
  getExportAdapters,
  detectImportAdapter,
  getExportAdapterById,
  shapesToInterchange,
  interchangeToShapeData,
} from '../../src/interchange';
import type { Shape } from '@draftila/shared';

describe('Interchange Integration', () => {
  beforeEach(() => {
    clearAdapters();
    resetAdapters();
  });

  test('initializeDefaultAdapters registers all adapters', () => {
    initializeDefaultAdapters();

    const importAdapters = getImportAdapters();
    const exportAdapters = getExportAdapters();

    expect(importAdapters.length).toBeGreaterThanOrEqual(2);
    expect(exportAdapters.length).toBeGreaterThanOrEqual(2);

    const importIds = importAdapters.map((a) => a.id);
    expect(importIds).toContain('draftila-clipboard');
    expect(importIds).toContain('svg-clipboard');

    const exportIds = exportAdapters.map((a) => a.id);
    expect(exportIds).toContain('draftila-clipboard-export');
    expect(exportIds).toContain('svg-export');
  });

  test('initializeDefaultAdapters is idempotent', () => {
    initializeDefaultAdapters();
    const countBefore = getImportAdapters().length;
    initializeDefaultAdapters();
    expect(getImportAdapters().length).toBe(countBefore);
  });

  test('detects Draftila clipboard', () => {
    initializeDefaultAdapters();
    const text = JSON.stringify({ type: 'draftila/shapes', shapes: [] });
    const adapter = detectImportAdapter({ text });
    expect(adapter?.platform).toBe('draftila');
  });

  test('detects SVG clipboard', () => {
    initializeDefaultAdapters();
    const html = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const adapter = detectImportAdapter({ html });
    expect(adapter?.platform).toBe('svg');
  });

  test('roundtrip: shapes -> interchange -> shape data', () => {
    const shapes: Shape[] = [
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
        name: 'TestRect',
        blendMode: 'normal',
        fills: [{ color: '#FF0000', opacity: 1, visible: true }],
        strokes: [],
        cornerRadius: 8,
        cornerSmoothing: 0,
        shadows: [],
        blurs: [],
      },
    ];

    const doc = shapesToInterchange(shapes);
    const data = interchangeToShapeData(doc);

    expect(data).toHaveLength(1);
    expect(data[0]!.type).toBe('rectangle');
    expect(data[0]!.props['x']).toBe(10);
    expect(data[0]!.props['y']).toBe(20);
    expect(data[0]!.props['width']).toBe(100);
    expect(data[0]!.props['height']).toBe(50);
    expect(data[0]!.props['cornerRadius']).toBe(8);
    expect(data[0]!.props['name']).toBe('TestRect');
    expect(data[0]!.parentIndex).toBeNull();
  });

  test('SVG export adapter produces valid SVG', () => {
    initializeDefaultAdapters();
    const shapes: Shape[] = [
      {
        id: 'e1',
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        parentId: null,
        opacity: 1,
        locked: false,
        visible: true,
        name: '',
        blendMode: 'normal',
        fills: [{ color: '#00FF00', opacity: 1, visible: true }],
        strokes: [],
        shadows: [],
        blurs: [],
      },
    ];

    const doc = shapesToInterchange(shapes);
    const adapter = getExportAdapterById('svg-export');
    expect(adapter).toBeDefined();

    const result = adapter!.export(doc);
    expect(result.text).toContain('<svg');
    expect(result.text).toContain('<ellipse');
  });
});
