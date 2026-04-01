import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import { generateHtmlCss, generateHtmlTailwind } from '../src/codegen/html-generator';

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
    expect(html).toContain('family=Inter:wght@100;200;300;400;500;600;700;800;900');
  });

  test('includes page background and google font link in tailwind output', () => {
    const html = generateHtmlTailwind([textShape], undefined, '#111111');
    expect(html).toContain('background: #111111;');
    expect(html).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?');
    expect(html).toContain('family=Inter:wght@100;200;300;400;500;600;700;800;900');
  });
});
