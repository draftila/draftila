import { describe, test, expect } from 'bun:test';
import { parseSvg, extractSvgFromHtml } from '../../../src/interchange/svg/svg-parser';

describe('SVG Parser', () => {
  describe('parseSvg', () => {
    test('parses an empty SVG', () => {
      const doc = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      expect(doc.nodes).toHaveLength(0);
      expect(doc.metadata.source).toBe('svg');
    });

    test('parses a rectangle as path with correct bounds', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="100" height="50" fill="#FF0000"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(20);
      expect(doc.nodes[0]!.width).toBe(100);
      expect(doc.nodes[0]!.height).toBe(50);
      expect(doc.nodes[0]!.fills.length).toBeGreaterThan(0);
    });

    test('parses an ellipse with correct bounds', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="50" rx="40" ry="30" fill="#00FF00"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.x).toBeCloseTo(10, 0);
      expect(doc.nodes[0]!.y).toBeCloseTo(20, 0);
      expect(doc.nodes[0]!.width).toBeCloseTo(80, 0);
      expect(doc.nodes[0]!.height).toBeCloseTo(60, 0);
    });

    test('parses a circle with correct bounds', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="25" fill="blue"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.width).toBeCloseTo(50, 0);
      expect(doc.nodes[0]!.height).toBeCloseTo(50, 0);
    });

    test('parses a line as path', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="20" x2="110" y2="120" stroke="#000" stroke-width="2"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.strokes).toHaveLength(1);
    });

    test('parses a polygon as path', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><polygon points="50,0 100,100 0,100" fill="#D9D9D9"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.svgPathData).toBeTruthy();
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

    test('parses a path element with correct bounds', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10 10 L 100 10 L 100 100 Z" fill="#000"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.name).toBe('Vector');
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(10);
      expect(doc.nodes[0]!.width).toBe(90);
      expect(doc.nodes[0]!.height).toBe(90);
      expect(doc.nodes[0]!.svgPathData).toBeTruthy();
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
    });

    test('handles parse errors gracefully', () => {
      const doc = parseSvg('not svg at all');
      expect(doc.nodes).toHaveLength(0);
    });

    test('wraps multiple top-level elements in a frame', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
        <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
        <rect x="60" y="0" width="50" height="50" fill="#00FF00"/>
        <text x="150" y="30" fill="#000">Hi</text>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('frame');
      expect(doc.nodes[0]!.width).toBe(200);
      expect(doc.nodes[0]!.height).toBe(100);
      expect(doc.nodes[0]!.children).toHaveLength(3);
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
    test('parses named colors', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="red"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });

    test('parses rgb colors', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="rgb(255, 0, 0)"/></svg>';
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
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

  describe('viewBox', () => {
    test('preserves viewBox dimensions in frame', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">
        <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
    });

    test('preserves content when viewBox matches dimensions', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <rect x="0" y="0" width="50" height="50" fill="#FF0000"/>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.width).toBe(50);
      expect(doc.nodes[0]!.height).toBe(50);
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
  });

  describe('style inheritance via SVGO', () => {
    test('SVGO moves group fill to child elements', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">
        <g fill="#FF0000">
          <rect x="0" y="0" width="100" height="100"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
    });

    test('SVGO moves group stroke to child elements', () => {
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
  });

  describe('CSS class styles', () => {
    test('applies class-based styles via SVGO inlineStyles', () => {
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
      const root = doc.nodes[0]!;
      if (root.type === 'frame') {
        expect(root.children.length).toBeGreaterThanOrEqual(2);
      }
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

    test('keeps grouped child positions in absolute canvas coordinates', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
        <g>
          <path d="M1200 800H1000V900H1200Z" fill="#5046E5"/>
          <path d="M1300 830H1250V860H1300Z" fill="#FFFFFF"/>
        </g>
      </svg>`;
      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);

      const allNodes: Array<(typeof doc.nodes)[number]> = [];
      const stack = [...doc.nodes];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        allNodes.push(node);
        for (const child of node.children) {
          stack.push(child);
        }
      }

      const pathNodes = allNodes.filter((n) => n.type === 'path').sort((a, b) => a.x - b.x);
      expect(pathNodes).toHaveLength(2);
      expect(pathNodes[0]!.x).toBeCloseTo(1000, 0);
      expect(pathNodes[1]!.x).toBeCloseTo(1250, 0);
    });
  });

  describe('attribute priority', () => {
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
      expect(rect.gradients).toHaveLength(1);
      expect(rect.gradients[0]!.stops).toHaveLength(2);

      const path = frame.children[1]!;
      expect(path.type).toBe('path');
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

  describe('fidelity mode', () => {
    test('imports SVG as an svg node with full markup', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><g transform="rotate(15 120 60)"><rect x="10" y="10" width="220" height="100" fill="url(#g)"/></g><defs><linearGradient id="g"><stop offset="0" stop-color="#FF0000"/><stop offset="1" stop-color="#0000FF"/></linearGradient></defs></svg>';
      const doc = parseSvg(svg, { mode: 'fidelity' });
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('svg');
      expect(doc.nodes[0]!.width).toBe(240);
      expect(doc.nodes[0]!.height).toBe(120);
      expect(doc.nodes[0]!.svgContent).toContain('<linearGradient');
    });

    test('uses viewBox dimensions when width and height are missing', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 256"><path d="M0 0H512V256H0Z"/></svg>';
      const doc = parseSvg(svg, { mode: 'fidelity' });
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.width).toBe(512);
      expect(doc.nodes[0]!.height).toBe(256);
    });
  });

  describe('svg effects and clipping', () => {
    test('maps group gaussian blur filter to child blur', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <defs>
          <filter id="blur"><feGaussianBlur stdDeviation="12"/></filter>
        </defs>
        <g filter="url(#blur)">
          <path d="M10 10H110V60H10Z" fill="#FF0000"/>
        </g>
      </svg>`;

      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('path');
      expect(doc.nodes[0]!.blurs).toHaveLength(1);
      expect(doc.nodes[0]!.blurs[0]!.type).toBe('layer');
      expect(doc.nodes[0]!.blurs[0]!.radius).toBe(12);
    });

    test('maps clip-path rect on group to clipping frame', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <defs>
          <clipPath id="clip"><rect width="120" height="80" transform="translate(4 6)"/></clipPath>
        </defs>
        <g clip-path="url(#clip)">
          <rect x="0" y="0" width="200" height="100" fill="#0F172B"/>
        </g>
      </svg>`;

      const doc = parseSvg(svg);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('frame');
      expect(doc.nodes[0]!.clip).toBeTrue();
      expect(doc.nodes[0]!.x).toBe(4);
      expect(doc.nodes[0]!.y).toBe(6);
      expect(doc.nodes[0]!.width).toBe(120);
      expect(doc.nodes[0]!.height).toBe(80);
      expect(doc.nodes[0]!.children).toHaveLength(1);
    });
  });
});
