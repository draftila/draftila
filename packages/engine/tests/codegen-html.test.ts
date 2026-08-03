import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { Shape } from '@draftila/shared';
import {
  generateHtmlCss,
  generateHtmlTailwind,
  generateHtmlCssParts,
} from '../src/codegen/html-generator';
import { generateCss, generateCssAllLayers } from '../src/codegen/css-generator';
import { generateTailwind, generateTailwindAllLayers } from '../src/codegen/tailwind-generator';
import { generateSwiftUI } from '../src/codegen/swiftui-generator';
import { generateCompose } from '../src/codegen/compose-generator';
import { __resetCustomFontState, registerCustomFonts } from '../src/custom-fonts';

const textShape: Shape = {
  id: 'text-1',
  type: 'text',
  x: 0,
  y: 0,
  width: 200,
  height: 24,
  rotation: 0,
  parentId: null,
  opacity: 1,
  locked: false,
  visible: true,
  name: 'Heading',
  blendMode: 'normal',
  content: 'Hello',
  textAutoResize: 'none',
  fontSize: 16,
  fontFamily: 'Inter',
  fontWeight: 400,
  fontStyle: 'normal',
  textAlign: 'left',
  verticalAlign: 'top',
  lineHeight: 1.2,
  letterSpacing: 0,
  textDecoration: 'none',
  textTransform: 'none',
  textTruncation: 'none',
  fills: [{ color: '#111111', opacity: 1, visible: true }],
  shadows: [],
  blurs: [],
};

describe('html codegen', () => {
  test('includes page background and google font link in css output', () => {
    const html = generateHtmlCss([textShape], '#101010');
    expect(html).toContain('background: #101010;');
    expect(html).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?');
    expect(html).toContain('family=Inter:wght@400');
  });

  test('includes page background and google font link in tailwind output', () => {
    const html = generateHtmlTailwind([textShape], undefined, '#111111');
    expect(html).toContain('background: #111111;');
    expect(html).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?');
    expect(html).toContain('family=Inter:wght@400');
  });
});

describe('custom fonts in codegen', () => {
  const customShape: Shape = {
    ...textShape,
    id: 'text-custom',
    fontFamily: 'Draftila Sans',
    fontWeight: 700,
  };

  beforeEach(() => {
    __resetCustomFontState();
    registerCustomFonts([
      {
        name: 'Draftila Sans',
        variants: [
          { weight: 400, style: 'normal', url: '/storage/fonts/acme-400.woff2', format: 'woff2' },
          { weight: 700, style: 'normal', url: '/storage/fonts/acme-700.woff2', format: 'woff2' },
        ],
      },
    ]);
  });

  afterEach(() => {
    __resetCustomFontState();
  });

  test('custom families are excluded from the google fonts link', () => {
    const html = generateHtmlCss([customShape, textShape]);
    const link = /<link rel="stylesheet" href="([^"]*)">/.exec(html)?.[1] ?? '';
    expect(link).toContain('family=Inter:wght@400');
    expect(link).not.toContain('Draftila');
  });

  test('a document using only custom families emits no google link at all', () => {
    const html = generateHtmlCss([customShape]);
    expect(html).not.toContain('fonts.googleapis.com');
  });

  test('customFontCss is injected as a style block in the combined css document', () => {
    const css = '@font-face { font-family: "Draftila Sans"; }';
    const html = generateHtmlCss([customShape], null, css);
    expect(html).toContain(`<style>\n${css}\n  </style>`);
  });

  test('customFontCss is injected as a style block in the combined tailwind document', () => {
    const css = '@font-face { font-family: "Draftila Sans"; }';
    const html = generateHtmlTailwind([customShape], undefined, null, css);
    expect(html).toContain(`<style>\n${css}\n  </style>`);
  });

  test('customFontCss is prepended to generateHtmlCssParts().css', () => {
    const css = '@font-face { font-family: "Draftila Sans"; }';
    const parts = generateHtmlCssParts([customShape], css);
    expect(parts.css.startsWith(`${css}\n\n`)).toBe(true);
    expect(parts.css).toContain('.heading {');
    expect(generateHtmlCssParts([customShape]).css).not.toContain('@font-face');
  });

  test('css-flavoured targets carry a relative-url comment header', () => {
    const expected =
      '/* Custom fonts required: "Draftila Sans" — /storage/fonts/acme-700.woff2 */\n\n';
    expect(generateCss([customShape]).startsWith(expected)).toBe(true);
    expect(generateCssAllLayers([customShape]).startsWith(expected)).toBe(true);
    expect(generateTailwind([customShape]).startsWith(expected)).toBe(true);
    expect(generateTailwindAllLayers([customShape]).startsWith(expected)).toBe(true);
    expect(generateCss([customShape])).not.toContain('http');
  });

  test('swiftui and compose carry a line-comment header', () => {
    const expected =
      '// Custom fonts required: "Draftila Sans" — /storage/fonts/acme-700.woff2\n\n';
    expect(generateSwiftUI([customShape]).startsWith(expected)).toBe(true);
    expect(generateCompose([customShape]).startsWith(expected)).toBe(true);
    expect(generateSwiftUI([customShape])).not.toContain('http');
  });

  test('the header lists every used variant and is absent without custom fonts', () => {
    const both = generateCss([customShape, { ...customShape, id: 't2', fontWeight: 400 }]);
    expect(both).toContain(
      '/* Custom fonts required: "Draftila Sans" — /storage/fonts/acme-700.woff2, /storage/fonts/acme-400.woff2 */',
    );
    expect(generateCss([textShape])).not.toContain('Custom fonts required');
    expect(generateSwiftUI([textShape])).not.toContain('Custom fonts required');
  });

  test('segment font families are escaped in the generated css', () => {
    const shape: Shape = {
      ...textShape,
      segments: [{ text: 'hi', fontFamily: "Ac'me\\Sans" }],
    } as Shape;
    const parts = generateHtmlCssParts([shape]);
    expect(parts.css).toContain("font-family: 'Ac\\'me\\\\Sans';");
  });
});
