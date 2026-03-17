import { describe, test, expect } from 'bun:test';
import { parseSvg, extractSvgFromHtml } from '../../../src/interchange/svg/svg-parser';

describe('SVG Parser', () => {
  describe('parseSvg', () => {
    test('parses an empty SVG', () => {
      const doc = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      expect(doc.nodes).toHaveLength(0);
      expect(doc.metadata.source).toBe('svg');
    });

    test('parses a rectangle', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="100" height="50" fill="#FF0000"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(20);
      expect(doc.nodes[0]!.width).toBe(100);
      expect(doc.nodes[0]!.height).toBe(50);
      expect(doc.nodes[0]!.fills.length).toBeGreaterThan(0);
    });

    test('parses rectangle with rx corner radius', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" rx="10" fill="#000"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.cornerRadius).toBe(10);
    });

    test('parses an ellipse', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="50" rx="40" ry="30" fill="#00FF00"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('ellipse');
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(20);
      expect(doc.nodes[0]!.width).toBe(80);
      expect(doc.nodes[0]!.height).toBe(60);
    });

    test('parses a circle', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="25" fill="blue"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('ellipse');
      expect(doc.nodes[0]!.width).toBe(50);
      expect(doc.nodes[0]!.height).toBe(50);
    });

    test('parses a line', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="20" x2="110" y2="120" stroke="#000" stroke-width="2"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('line');
      expect(doc.nodes[0]!.x1).toBe(10);
      expect(doc.nodes[0]!.y1).toBe(20);
      expect(doc.nodes[0]!.x2).toBe(110);
      expect(doc.nodes[0]!.y2).toBe(120);
    });

    test('parses a polygon as path', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><polygon points="50,0 100,100 0,100" fill="#D9D9D9"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.svgPathData).toBe('M50 0L100 100L0 100Z');
    });

    test('parses a text element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="30" font-size="16" font-family="Arial" fill="#333">Hello</text></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('text');
      expect(doc.nodes[0]!.content).toBe('Hello');
      expect(doc.nodes[0]!.fontSize).toBe(16);
      expect(doc.nodes[0]!.fontFamily).toBe('Arial');
    });

    test('parses a path element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10 10 L 100 10 L 100 100 Z" fill="#000"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.name).toBe('Vector');
      expect(doc.nodes[0]!.svgPathData).toBe('M0 0L90 0L90 90Z');
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(10);
      expect(doc.nodes[0]!.width).toBe(90);
      expect(doc.nodes[0]!.height).toBe(90);
    });

    test('parses a group element with children', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g id="myGroup">
          <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
          <rect x="60" y="0" width="50" height="50" fill="#00FF00"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('group');
      expect(doc.nodes[0]!.name).toBe('myGroup');
      expect(doc.nodes[0]!.children).toHaveLength(2);
    });

    test('unwraps single-child group', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="10" y="20" width="50" height="50" fill="#FF0000"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
    });

    test('parses stroke attributes', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="none" stroke="#FF0000" stroke-width="3"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.strokes).toHaveLength(1);
      expect(doc.nodes[0]!.strokes[0]!.width).toBe(3);
    });

    test('parses opacity', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="#000" opacity="0.5"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.opacity).toBe(0.5);
    });

    test('parses CSS inline styles', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" style="fill: #FF0000; stroke: #000; stroke-width: 2"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.strokes).toHaveLength(1);
    });

    test('parses transform translate', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="50" height="50" fill="#000" transform="translate(100, 200)"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.x).toBe(100);
      expect(doc.nodes[0]!.y).toBe(200);
    });

    test('parses image element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><image x="10" y="20" width="100" height="80" href="http://example.com/img.png"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('image');
      expect(doc.nodes[0]!.src).toBe('http://example.com/img.png');
    });

    test('skips defs elements', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="g1"><stop offset="0" stop-color="#000"/></linearGradient></defs>
        <rect x="0" y="0" width="100" height="100" fill="#000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
    });

    test('handles parse errors gracefully', () => {
      const doc = parseSvg('not svg at all');
      expect(doc.nodes).toHaveLength(0);
    });

    test('wraps multiple top-level elements in a frame', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
        <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
        <ellipse cx="100" cy="25" rx="25" ry="25" fill="#00FF00"/>
        <text x="150" y="30" fill="#000">Hi</text>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('frame');
      expect(doc.nodes[0]!.width).toBe(200);
      expect(doc.nodes[0]!.height).toBe(100);
      expect(doc.nodes[0]!.children).toHaveLength(3);
      expect(doc.nodes[0]!.children[0]!.type).toBe('rectangle');
      expect(doc.nodes[0]!.children[1]!.type).toBe('ellipse');
      expect(doc.nodes[0]!.children[2]!.type).toBe('text');
    });

    test('parses text with font-weight bold', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="20" font-weight="bold" fill="#000">Bold</text></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fontWeight).toBe(700);
    });

    test('parses text with text-anchor middle', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><text x="50" y="20" text-anchor="middle" fill="#000">Center</text></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.textAlign).toBe('center');
    });

    test('parses polyline as path', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><polyline points="10,20 110,120" stroke="#000" stroke-width="2"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.svgPathData).toBe('M0 0L100 100');
    });
  });

  describe('extractSvgFromHtml', () => {
    test('extracts SVG from HTML', () => {
      const html =
        '<div>Hello</div><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect/></svg><p>World</p>';
      const svg = extractSvgFromHtml(html);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    test('returns null for no SVG', () => {
      expect(extractSvgFromHtml('<div>No svg here</div>')).toBeNull();
    });
  });
});
