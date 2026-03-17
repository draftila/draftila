import { describe, test, expect } from 'bun:test';
import {
  normalizeColor,
  colorToOpacity,
  parseLength,
} from '../../../src/interchange/svg/svg-utils';
import {
  parseCssInlineStyle,
  parseCssStyleSheet,
  getEffectiveAttribute,
} from '../../../src/interchange/svg/css';

describe('SVG Utils', () => {
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

    test('normalizes hsl()', () => {
      expect(normalizeColor('hsl(0, 100%, 50%)')).toBe('#FF0000');
      expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00FF00');
      expect(normalizeColor('hsl(240, 100%, 50%)')).toBe('#0000FF');
    });

    test('normalizes hsla()', () => {
      const result = normalizeColor('hsla(0, 100%, 50%, 0.5)');
      expect(result).toContain('#FF0000');
      expect(result!.length).toBe(9);
    });

    test('handles currentColor', () => {
      expect(normalizeColor('currentColor')).toBe('#000000');
      expect(normalizeColor('currentcolor')).toBe('#000000');
    });

    test('handles rgb with percentages', () => {
      expect(normalizeColor('rgb(100%, 0%, 0%)')).toBe('#FF0000');
      expect(normalizeColor('rgb(50%, 50%, 50%)')).toBe('#808080');
    });

    test('returns null for empty string', () => {
      expect(normalizeColor('')).toBeNull();
    });

    test('returns null for undefined', () => {
      expect(normalizeColor(undefined)).toBeNull();
    });

    test('normalizes 9-char hex with alpha', () => {
      const result = normalizeColor('#ff000080');
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

    test('parses float values', () => {
      expect(parseLength('3.14')).toBeCloseTo(3.14, 5);
    });

    test('parses negative values', () => {
      expect(parseLength('-10')).toBe(-10);
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

    test('handles values with colons', () => {
      const result = parseCssInlineStyle('fill: url(#grad);');
      expect(result['fill']).toBe('url(#grad)');
    });
  });

  describe('parseCssStyleSheet', () => {
    test('parses class rules', () => {
      const rules = parseCssStyleSheet('.red { fill: #FF0000; stroke: none; }');
      expect(rules.get('.red')).toBeDefined();
      expect(rules.get('.red')!['fill']).toBe('#FF0000');
    });

    test('parses multiple rules', () => {
      const rules = parseCssStyleSheet('.a { fill: red; } .b { fill: blue; }');
      expect(rules.size).toBe(2);
    });
  });

  describe('getEffectiveAttribute', () => {
    test('prefers inline style over attribute', () => {
      const el = new DOMParser()
        .parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>',
          'image/svg+xml',
        )
        .querySelector('rect')!;
      const result = getEffectiveAttribute(el, 'fill', 'fill', { fill: '#FF0000' }, {});
      expect(result).toBe('#FF0000');
    });

    test('falls back to element attribute', () => {
      const el = new DOMParser()
        .parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>',
          'image/svg+xml',
        )
        .querySelector('rect')!;
      const result = getEffectiveAttribute(el, 'fill', 'fill', {}, {});
      expect(result).toBe('#000');
    });

    test('returns null when no value found anywhere', () => {
      const el = new DOMParser()
        .parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 'image/svg+xml')
        .querySelector('rect')!;
      const result = getEffectiveAttribute(el, 'fill', 'fill', {}, {});
      expect(result).toBeNull();
    });
  });
});
