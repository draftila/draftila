import { describe, test, expect } from 'bun:test';
import {
  parseTransform,
  decomposeTransform,
  normalizeColor,
  colorToOpacity,
  parseLength,
  parseCssInlineStyle,
  parseSvgPathData,
  pathCommandsToBounds,
  multiplyMatrices,
  IDENTITY_MATRIX,
} from '../../../src/interchange/svg/svg-utils';

describe('SVG Utils', () => {
  describe('parseTransform', () => {
    test('returns identity for null', () => {
      expect(parseTransform(null)).toEqual(IDENTITY_MATRIX);
    });

    test('parses translate', () => {
      const m = parseTransform('translate(10, 20)');
      expect(m.e).toBe(10);
      expect(m.f).toBe(20);
    });

    test('parses translate with single value', () => {
      const m = parseTransform('translate(10)');
      expect(m.e).toBe(10);
      expect(m.f).toBe(0);
    });

    test('parses scale', () => {
      const m = parseTransform('scale(2)');
      expect(m.a).toBe(2);
      expect(m.d).toBe(2);
    });

    test('parses scale with two values', () => {
      const m = parseTransform('scale(2, 3)');
      expect(m.a).toBe(2);
      expect(m.d).toBe(3);
    });

    test('parses rotate', () => {
      const m = parseTransform('rotate(90)');
      expect(Math.abs(m.a)).toBeLessThan(0.0001);
      expect(m.b).toBeCloseTo(1, 5);
    });

    test('parses matrix', () => {
      const m = parseTransform('matrix(1, 0, 0, 1, 50, 100)');
      expect(m.a).toBe(1);
      expect(m.e).toBe(50);
      expect(m.f).toBe(100);
    });

    test('parses chained transforms', () => {
      const m = parseTransform('translate(10, 20) scale(2)');
      expect(m.e).toBe(10);
      expect(m.f).toBe(20);
      expect(m.a).toBe(2);
    });
  });

  describe('decomposeTransform', () => {
    test('decomposes identity matrix', () => {
      const result = decomposeTransform(IDENTITY_MATRIX);
      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
      expect(result.rotation).toBe(0);
      expect(result.scaleX).toBe(1);
      expect(result.scaleY).toBe(1);
    });

    test('decomposes translation', () => {
      const result = decomposeTransform(parseTransform('translate(30, 40)'));
      expect(result.translateX).toBe(30);
      expect(result.translateY).toBe(40);
    });
  });

  describe('multiplyMatrices', () => {
    test('identity * anything = anything', () => {
      const m = { a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 };
      const result = multiplyMatrices(IDENTITY_MATRIX, m);
      expect(result).toEqual(m);
    });
  });

  describe('normalizeColor', () => {
    test('returns null for none', () => {
      expect(normalizeColor('none')).toBeNull();
    });

    test('returns null for transparent', () => {
      expect(normalizeColor('transparent')).toBeNull();
    });

    test('returns null for null', () => {
      expect(normalizeColor(null)).toBeNull();
    });

    test('normalizes named colors', () => {
      expect(normalizeColor('red')).toBe('#FF0000');
      expect(normalizeColor('blue')).toBe('#0000FF');
      expect(normalizeColor('white')).toBe('#FFFFFF');
    });

    test('normalizes shorthand hex', () => {
      expect(normalizeColor('#f00')).toBe('#FF0000');
    });

    test('normalizes full hex', () => {
      expect(normalizeColor('#ff0000')).toBe('#FF0000');
    });

    test('normalizes rgb()', () => {
      expect(normalizeColor('rgb(255, 0, 0)')).toBe('#FF0000');
    });

    test('normalizes rgba()', () => {
      const result = normalizeColor('rgba(255, 0, 0, 0.5)');
      expect(result).toBe('#FF000080');
    });
  });

  describe('colorToOpacity', () => {
    test('extracts opacity from 9-char hex', () => {
      const result = colorToOpacity('#FF000080');
      expect(result.hex).toBe('#FF0000');
      expect(result.opacity).toBeCloseTo(0.502, 2);
    });

    test('returns 1 for 7-char hex', () => {
      const result = colorToOpacity('#FF0000');
      expect(result.hex).toBe('#FF0000');
      expect(result.opacity).toBe(1);
    });
  });

  describe('parseLength', () => {
    test('parses number string', () => {
      expect(parseLength('42')).toBe(42);
    });

    test('returns fallback for null', () => {
      expect(parseLength(null, 10)).toBe(10);
    });

    test('handles px suffix', () => {
      expect(parseLength('16px')).toBe(16);
    });

    test('returns fallback for non-numeric', () => {
      expect(parseLength('auto', 0)).toBe(0);
    });
  });

  describe('parseCssInlineStyle', () => {
    test('parses simple styles', () => {
      const result = parseCssInlineStyle('fill: red; stroke: blue');
      expect(result['fill']).toBe('red');
      expect(result['stroke']).toBe('blue');
    });

    test('returns empty for null', () => {
      expect(parseCssInlineStyle(null)).toEqual({});
    });
  });

  describe('parseSvgPathData', () => {
    test('parses M and L commands', () => {
      const cmds = parseSvgPathData('M 10 20 L 30 40');
      expect(cmds).toHaveLength(2);
      expect(cmds[0]!.type).toBe('M');
      expect(cmds[0]!.values).toEqual([10, 20]);
      expect(cmds[1]!.type).toBe('L');
      expect(cmds[1]!.values).toEqual([30, 40]);
    });

    test('parses Z command', () => {
      const cmds = parseSvgPathData('M 0 0 L 100 0 L 100 100 Z');
      expect(cmds).toHaveLength(4);
      expect(cmds[3]!.type).toBe('Z');
    });

    test('parses cubic bezier', () => {
      const cmds = parseSvgPathData('M 0 0 C 10 20 30 40 50 60');
      expect(cmds[1]!.type).toBe('C');
      expect(cmds[1]!.values).toEqual([10, 20, 30, 40, 50, 60]);
    });
  });

  describe('pathCommandsToBounds', () => {
    test('computes bounds for simple path', () => {
      const cmds = parseSvgPathData('M 10 20 L 110 120');
      const bounds = pathCommandsToBounds(cmds);
      expect(bounds.x).toBe(10);
      expect(bounds.y).toBe(20);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(100);
    });

    test('returns zero bounds for empty commands', () => {
      const bounds = pathCommandsToBounds([]);
      expect(bounds.x).toBe(0);
      expect(bounds.width).toBe(0);
    });

    test('handles relative commands', () => {
      const cmds = parseSvgPathData('M 10 10 l 50 50');
      const bounds = pathCommandsToBounds(cmds);
      expect(bounds.x).toBe(10);
      expect(bounds.y).toBe(10);
      expect(bounds.width).toBe(50);
      expect(bounds.height).toBe(50);
    });

    test('handles H and V commands', () => {
      const cmds = parseSvgPathData('M 0 0 H 100 V 50');
      const bounds = pathCommandsToBounds(cmds);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(50);
    });
  });
});
