import { describe, test, expect } from 'bun:test';
import { generateSvg } from '../../../src/interchange/svg/svg-generator';
import {
  createInterchangeNode,
  createInterchangeDocument,
} from '../../../src/interchange/interchange-format';

describe('SVG Generator', () => {
  test('generates empty SVG for empty document', () => {
    const doc = createInterchangeDocument([], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('width="0"');
    expect(svg).toContain('height="0"');
  });

  test('generates SVG for a rectangle', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      fills: [{ color: '#FF0000', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('#FF0000');
  });

  test('generates SVG for a rectangle with corner radius', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ color: '#000', opacity: 1, visible: true }],
      cornerRadius: 10,
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('rx="10"');
  });

  test('generates SVG for independent corner radii using path', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ color: '#000', opacity: 1, visible: true }],
      cornerRadiusTL: 5,
      cornerRadiusTR: 10,
      cornerRadiusBR: 15,
      cornerRadiusBL: 20,
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<path');
  });

  test('generates SVG for an ellipse', () => {
    const node = createInterchangeNode('ellipse', {
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      fills: [{ color: '#00FF00', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('rx="50"');
    expect(svg).toContain('ry="30"');
  });

  test('generates SVG for text', () => {
    const node = createInterchangeNode('text', {
      x: 0,
      y: 0,
      width: 200,
      height: 24,
      content: 'Hello World',
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 400,
      fills: [{ color: '#000000', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<text');
    expect(svg).toContain('Hello World');
    expect(svg).toContain('font-size="16"');
  });

  test('generates SVG for a line', () => {
    const node = createInterchangeNode('line', {
      x: 0,
      y: 0,
      width: 100,
      height: 1,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      strokes: [
        {
          color: '#000',
          width: 2,
          opacity: 1,
          visible: true,
          cap: 'butt',
          join: 'miter',
          align: 'center',
          dashPattern: 'solid',
          dashOffset: 0,
          miterLimit: 4,
        },
      ],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<line');
  });

  test('generates SVG for a polygon', () => {
    const node = createInterchangeNode('polygon', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      sides: 6,
      fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<polygon');
  });

  test('generates SVG for a star', () => {
    const node = createInterchangeNode('star', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      starPoints: 5,
      innerRadius: 0.38,
      fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<polygon');
  });

  test('generates SVG with opacity group wrapper', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      opacity: 0.5,
      fills: [{ color: '#000', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('opacity="0.5"');
  });

  test('generates SVG with shadow filter', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ color: '#000', opacity: 1, visible: true }],
      shadows: [{ type: 'drop', x: 2, y: 4, blur: 8, spread: 0, color: '#000000', visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<filter');
    expect(svg).toContain('feDropShadow');
  });

  test('generates SVG with stroke attributes', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [],
      strokes: [
        {
          color: '#FF0000',
          width: 3,
          opacity: 1,
          visible: true,
          cap: 'round',
          join: 'round',
          align: 'center',
          dashPattern: 'dash',
          dashOffset: 0,
          miterLimit: 4,
        },
      ],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('stroke="#FF0000"');
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-dasharray=');
  });

  test('generates SVG for image with src', () => {
    const node = createInterchangeNode('image', {
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      src: 'http://example.com/img.png',
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<image');
    expect(svg).toContain('http://example.com/img.png');
  });

  test('generates SVG for image without src (placeholder)', () => {
    const node = createInterchangeNode('image', {
      x: 0,
      y: 0,
      width: 200,
      height: 150,
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('fill="#E0E0E0"');
  });

  test('generates valid SVG namespace', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test('generates SVG with fill-rule evenodd for path', () => {
    const node = createInterchangeNode('path', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      svgPathData: 'M0 0L100 0L100 100L0 100Z M25 25L75 25L75 75L25 75Z',
      fillRule: 'evenodd',
      fills: [{ color: '#000000', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('fill-rule="evenodd"');
  });

  test('does not include fill-rule for nonzero default', () => {
    const node = createInterchangeNode('path', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      svgPathData: 'M0 0L100 0L100 100Z',
      fillRule: 'nonzero',
      fills: [{ color: '#000000', opacity: 1, visible: true }],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).not.toContain('fill-rule');
  });

  test('generates gradient definitions', () => {
    const node = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fills: [{ color: '#FF0000', opacity: 1, visible: true }],
      gradients: [
        {
          type: 'linear',
          stops: [
            { color: '#FF0000', position: 0 },
            { color: '#0000FF', position: 1 },
          ],
          angle: 0,
        },
      ],
    });
    const doc = createInterchangeDocument([node], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('linearGradient');
    expect(svg).toContain('<stop');
  });

  test('generates SVG for a group', () => {
    const child1 = createInterchangeNode('rectangle', {
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      fills: [{ color: '#FF0000', opacity: 1, visible: true }],
    });
    const child2 = createInterchangeNode('ellipse', {
      x: 60,
      y: 0,
      width: 50,
      height: 50,
      fills: [{ color: '#00FF00', opacity: 1, visible: true }],
    });
    const group = createInterchangeNode('group', {
      x: 0,
      y: 0,
      width: 110,
      height: 50,
      children: [child1, child2],
    });
    const doc = createInterchangeDocument([group], { source: 'test' });
    const svg = generateSvg(doc);
    expect(svg).toContain('<rect');
    expect(svg).toContain('<ellipse');
  });
});
