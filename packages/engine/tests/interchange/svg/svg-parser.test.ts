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

  describe('gradient parsing', () => {
    test('parses linear gradient fill', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#FF0000"/>
            <stop offset="1" stop-color="#0000FF"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#grad1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.gradients).toHaveLength(1);
      expect(doc.nodes[0]!.gradients[0]!.type).toBe('linear');
      expect(doc.nodes[0]!.gradients[0]!.stops).toHaveLength(2);
      expect(doc.nodes[0]!.gradients[0]!.stops[0]!.color).toBe('#FF0000');
      expect(doc.nodes[0]!.gradients[0]!.stops[1]!.color).toBe('#0000FF');
    });

    test('parses radial gradient fill', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="rg1" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#FFFFFF"/>
            <stop offset="1" stop-color="#000000"/>
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="50" rx="50" ry="50" fill="url(#rg1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.gradients).toHaveLength(1);
      expect(doc.nodes[0]!.gradients[0]!.type).toBe('radial');
      expect(doc.nodes[0]!.gradients[0]!.cx).toBe(0.5);
    });

    test('parses gradient stop-opacity', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g1">
            <stop offset="0" stop-color="#FF0000" stop-opacity="0.5"/>
            <stop offset="1" stop-color="#0000FF" stop-opacity="1"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#g1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      const gradient = doc.nodes[0]!.gradients[0]!;
      expect(gradient.stops[0]!.color.length).toBe(9);
      expect(gradient.stops[1]!.color).toBe('#0000FF');
    });

    test('parses gradient with stop-opacity in style attribute', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g1">
            <stop offset="0" style="stop-color:#FF0000;stop-opacity:0.3"/>
            <stop offset="1" style="stop-color:#0000FF"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#g1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      const gradient = doc.nodes[0]!.gradients[0]!;
      expect(gradient.stops[0]!.color.length).toBe(9);
    });

    test('parses gradient with href inheritance', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="base">
            <stop offset="0" stop-color="#FF0000"/>
            <stop offset="1" stop-color="#0000FF"/>
          </linearGradient>
          <linearGradient id="derived" href="#base" x1="0" y1="0" x2="0" y2="1"/>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#derived)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.gradients).toHaveLength(1);
      expect(doc.nodes[0]!.gradients[0]!.stops).toHaveLength(2);
      expect(doc.nodes[0]!.gradients[0]!.stops[0]!.color).toBe('#FF0000');
    });

    test('parses gradient on stroke', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sg1">
            <stop offset="0" stop-color="#FF0000"/>
            <stop offset="1" stop-color="#0000FF"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="none" stroke="url(#sg1)" stroke-width="3"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.strokes).toHaveLength(1);
      expect(doc.nodes[0]!.gradients.length).toBeGreaterThan(0);
    });
  });

  describe('color handling', () => {
    test('parses hsl colors', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="hsl(0, 100%, 50%)"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });

    test('parses hsla colors', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="hsla(0, 100%, 50%, 0.5)"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.opacity).toBeCloseTo(0.5, 1);
    });

    test('parses currentColor', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" color="#FF0000"><path d="M0 0L100 0L100 100Z" fill="currentColor"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });

    test('parses rgb with percentages', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="rgb(100%, 0%, 0%)"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });
  });

  describe('fill-rule', () => {
    test('parses fill-rule evenodd on path', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100L0 100Z M25 25L75 25L75 75L25 75Z" fill="#000" fill-rule="evenodd"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fillRule).toBe('evenodd');
    });

    test('defaults fill-rule to nonzero', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100Z" fill="#000"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fillRule).toBe('nonzero');
    });

    test('parses fill-rule from CSS style', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100Z" style="fill: #000; fill-rule: evenodd"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fillRule).toBe('evenodd');
    });
  });

  describe('display and visibility', () => {
    test('skips elements with display none', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" fill="#FF0000"/>
        <rect x="200" y="0" width="100" height="100" fill="#00FF00" display="none"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
    });

    test('skips elements with visibility hidden', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" fill="#FF0000"/>
        <rect x="200" y="0" width="100" height="100" fill="#00FF00" visibility="hidden"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
    });

    test('skips elements with display none via style', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" fill="#FF0000"/>
        <rect x="200" y="0" width="100" height="100" style="fill:#00FF00;display:none"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
    });
  });

  describe('viewBox scaling', () => {
    test('scales content when viewBox differs from dimensions', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">
        <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.width).toBe(100);
      expect(doc.nodes[0]!.height).toBe(100);
    });

    test('does not scale when viewBox matches dimensions', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.width).toBe(50);
      expect(doc.nodes[0]!.height).toBe(50);
    });

    test('handles viewBox offset', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="50 50 100 100">
        <rect x="50" y="50" width="100" height="100" fill="#FF0000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.x).toBe(0);
      expect(doc.nodes[0]!.y).toBe(0);
    });
  });

  describe('image handling', () => {
    test('parses preserveAspectRatio meet as fit', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><image x="0" y="0" width="100" height="100" href="test.png" preserveAspectRatio="xMidYMid meet"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fit).toBe('fit');
    });

    test('parses preserveAspectRatio slice as crop', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><image x="0" y="0" width="100" height="100" href="test.png" preserveAspectRatio="xMidYMid slice"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fit).toBe('crop');
    });

    test('parses preserveAspectRatio none as fill', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><image x="0" y="0" width="100" height="100" href="test.png" preserveAspectRatio="none"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fit).toBe('fill');
    });

    test('parses data URI images', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image x="0" y="0" width="100" height="100" href="${dataUri}"/></svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.src).toBe(dataUri);
    });
  });

  describe('default fill behavior', () => {
    test('path with no fill attribute gets black default fill', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100Z"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#000000');
    });

    test('path with fill none has no fills', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100Z" fill="none" stroke="#000" stroke-width="2"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(0);
    });

    test('rect with no fill gets default gray', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#D9D9D9');
    });
  });

  describe('style inheritance', () => {
    test('inherits fill from parent group', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g fill="#FF0000">
          <rect x="0" y="0" width="100" height="100"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });

    test('inherits stroke from parent group', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g stroke="#00FF00" stroke-width="3">
          <rect x="0" y="0" width="100" height="100" fill="none"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.strokes).toHaveLength(1);
      expect(doc.nodes[0]!.strokes[0]!.color).toBe('#00FF00');
      expect(doc.nodes[0]!.strokes[0]!.width).toBe(3);
    });

    test('inherits fill from SVG root', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" fill="#FF0000"><rect x="0" y="0" width="100" height="100"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });
  });

  describe('use elements', () => {
    test('resolves use references', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="myRect" width="100" height="50" fill="#FF0000"/>
        </defs>
        <use href="#myRect" x="10" y="20"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(20);
    });
  });

  describe('CSS class styles', () => {
    test('applies class-based styles', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <style>.red { fill: #FF0000; }</style>
        <rect x="0" y="0" width="100" height="100" class="red"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });
  });

  describe('complex SVGs', () => {
    test('parses SVG icon with multiple paths', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
        <path d="M2 17L12 22L22 17"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('frame');
      expect(doc.nodes[0]!.children.length).toBeGreaterThanOrEqual(2);
    });

    test('parses SVG with nested groups', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g id="outer">
          <g id="inner">
            <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
            <rect x="60" y="0" width="50" height="50" fill="#00FF00"/>
          </g>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('group');
    });

    test('handles a elements as groups', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <a>
          <rect x="0" y="0" width="100" height="100" fill="#FF0000"/>
        </a>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
    });
  });

  describe('attribute priority (element attr overrides inherited)', () => {
    test('element fill attribute overrides inherited fill=none from SVG root', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" fill="#FF0000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });

    test('element fill=url() overrides inherited fill=none', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#FF0000"/>
            <stop offset="1" stop-color="#0000FF"/>
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#g1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.gradients).toHaveLength(1);
      expect(doc.nodes[0]!.gradients[0]!.type).toBe('linear');
    });

    test('element stroke attribute overrides inherited stroke from group', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g stroke="red" stroke-width="5">
          <rect x="0" y="0" width="100" height="100" fill="none" stroke="blue" stroke-width="2"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.strokes[0]!.color).toBe('#0000FF');
      expect(doc.nodes[0]!.strokes[0]!.width).toBe(2);
    });
  });

  describe('gradientUnits=userSpaceOnUse', () => {
    test('parses linear gradient with userSpaceOnUse correctly', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
        <defs>
          <linearGradient id="g1" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7F22FE"/>
            <stop offset="1" stop-color="#2F0C68"/>
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" rx="150" fill="url(#g1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.gradients).toHaveLength(1);
      expect(doc.nodes[0]!.gradients[0]!.type).toBe('linear');
      expect(doc.nodes[0]!.gradients[0]!.angle).toBeCloseTo(90, 1);
      expect(doc.nodes[0]!.gradients[0]!.stops).toHaveLength(2);
    });
  });

  describe('pattern fills', () => {
    test('converts pattern-filled rect to image node', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <pattern id="pat1" patternContentUnits="objectBoundingBox" width="1" height="1">
            <use xlink:href="#img1" transform="scale(0.01 0.01)"/>
          </pattern>
          <image id="img1" width="100" height="100" href="data:image/png;base64,ABC123"/>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#pat1)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.type).toBe('image');
      expect(doc.nodes[0]!.src).toBe('data:image/png;base64,ABC123');
    });

    test('converts pattern with direct image to image node', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <pattern id="pat2" width="1" height="1">
            <image href="https://example.com/photo.jpg" width="100" height="100"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#pat2)"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.type).toBe('image');
      expect(doc.nodes[0]!.src).toBe('https://example.com/photo.jpg');
    });
  });

  describe('real-world SVG examples', () => {
    test('parses gradient icon with defs after shapes and fill=none on root', () => {
      const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="1024" height="1024" rx="150" fill="url(#paint0_linear)"/>
        <path d="M512 300L512 700" stroke="white" stroke-width="20" stroke-linecap="round"/>
        <defs>
          <linearGradient id="paint0_linear" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7F22FE"/>
            <stop offset="1" stop-color="#2F0C68"/>
          </linearGradient>
        </defs>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);

      const frame = doc.nodes[0]!;
      expect(frame.type).toBe('frame');
      expect(frame.children).toHaveLength(2);

      const rect = frame.children[0]!;
      expect(rect.type).toBe('rectangle');
      expect(rect.gradients).toHaveLength(1);
      expect(rect.gradients[0]!.stops).toHaveLength(2);
      expect(rect.cornerRadius).toBe(150);

      const path = frame.children[1]!;
      expect(path.type).toBe('path');
      expect(path.fills).toHaveLength(0);
      expect(path.strokes).toHaveLength(1);
      expect(path.strokes[0]!.color).toBe('#FFFFFF');
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
