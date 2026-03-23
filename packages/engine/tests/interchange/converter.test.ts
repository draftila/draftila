import { describe, test, expect } from 'bun:test';
import type { Shape } from '@draftila/shared';
import { shapesToInterchange, interchangeToShapeData } from '../../src/interchange/converter';
import {
  createInterchangeNode,
  createInterchangeDocument,
} from '../../src/interchange/interchange-format';

describe('Converter', () => {
  describe('shapesToInterchange', () => {
    test('converts a rectangle shape', () => {
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
          name: 'Rect',
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
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('rectangle');
      expect(doc.nodes[0]!.x).toBe(10);
      expect(doc.nodes[0]!.y).toBe(20);
      expect(doc.nodes[0]!.width).toBe(100);
      expect(doc.nodes[0]!.height).toBe(50);
      expect(doc.nodes[0]!.cornerRadius).toBe(8);
      expect(doc.nodes[0]!.fills).toHaveLength(1);
      expect(doc.nodes[0]!.fills[0]!.color).toBe('#FF0000');
      expect(doc.nodes[0]!.name).toBe('Rect');
    });

    test('converts a text shape', () => {
      const shapes: Shape[] = [
        {
          id: 't1',
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
          name: '',
          blendMode: 'normal',
          content: 'Hello World',
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
          fills: [{ color: '#000000', opacity: 1, visible: true }],
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes[0]!.type).toBe('text');
      expect(doc.nodes[0]!.content).toBe('Hello World');
      expect(doc.nodes[0]!.fontSize).toBe(16);
      expect(doc.nodes[0]!.fontFamily).toBe('Inter');
    });

    test('preserves parent-child hierarchy', () => {
      const shapes: Shape[] = [
        {
          id: 'f1',
          type: 'frame',
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          rotation: 0,
          parentId: null,
          opacity: 1,
          locked: false,
          visible: true,
          name: 'Frame',
          blendMode: 'normal',
          fills: [{ color: '#FFFFFF', opacity: 1, visible: true }],
          strokes: [],
          clip: true,
          shadows: [],
          blurs: [],
          guides: [],
        },
        {
          id: 'r1',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          rotation: 0,
          parentId: 'f1',
          opacity: 1,
          locked: false,
          visible: true,
          name: '',
          blendMode: 'normal',
          fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
          strokes: [],
          cornerRadius: 0,
          cornerSmoothing: 0,
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0]!.type).toBe('frame');
      expect(doc.nodes[0]!.children).toHaveLength(1);
      expect(doc.nodes[0]!.children[0]!.type).toBe('rectangle');
    });

    test('converts an ellipse shape', () => {
      const shapes: Shape[] = [
        {
          id: 'e1',
          type: 'ellipse',
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          rotation: 0,
          parentId: null,
          opacity: 0.8,
          locked: false,
          visible: true,
          name: 'Circle',
          blendMode: 'normal',
          fills: [{ color: '#00FF00', opacity: 1, visible: true }],
          strokes: [],
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes[0]!.type).toBe('ellipse');
      expect(doc.nodes[0]!.opacity).toBe(0.8);
    });

    test('converts a line shape', () => {
      const shapes: Shape[] = [
        {
          id: 'l1',
          type: 'line',
          x: 0,
          y: 0,
          width: 100,
          height: 1,
          rotation: 0,
          parentId: null,
          opacity: 1,
          locked: false,
          visible: true,
          name: '',
          blendMode: 'normal',
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 0,
          strokes: [{ color: '#000000', width: 2, opacity: 1, visible: true }],
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes[0]!.type).toBe('line');
      expect(doc.nodes[0]!.x1).toBe(0);
      expect(doc.nodes[0]!.x2).toBe(100);
    });

    test('converts a polygon shape', () => {
      const shapes: Shape[] = [
        {
          id: 'p1',
          type: 'polygon',
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
          sides: 6,
          fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
          strokes: [],
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes[0]!.type).toBe('polygon');
      expect(doc.nodes[0]!.sides).toBe(6);
    });

    test('converts a star shape', () => {
      const shapes: Shape[] = [
        {
          id: 's1',
          type: 'star',
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
          points: 5,
          innerRadius: 0.38,
          fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
          strokes: [],
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes[0]!.type).toBe('star');
      expect(doc.nodes[0]!.starPoints).toBe(5);
      expect(doc.nodes[0]!.innerRadius).toBe(0.38);
    });

    test('converts an image shape', () => {
      const shapes: Shape[] = [
        {
          id: 'i1',
          type: 'image',
          x: 0,
          y: 0,
          width: 200,
          height: 150,
          rotation: 0,
          parentId: null,
          opacity: 1,
          locked: false,
          visible: true,
          name: '',
          blendMode: 'normal',
          src: 'data:image/png;base64,abc',
          fit: 'fill',
          shadows: [],
          blurs: [],
        },
      ];

      const doc = shapesToInterchange(shapes);
      expect(doc.nodes[0]!.type).toBe('image');
      expect(doc.nodes[0]!.src).toBe('data:image/png;base64,abc');
      expect(doc.nodes[0]!.fit).toBe('fill');
    });
  });

  describe('interchangeToShapeData', () => {
    test('converts a simple node to shape data', () => {
      const doc = createInterchangeDocument(
        [
          createInterchangeNode('rectangle', {
            x: 10,
            y: 20,
            width: 100,
            height: 50,
            fills: [{ color: '#FF0000', opacity: 1, visible: true }],
            cornerRadius: 8,
          }),
        ],
        { source: 'test' },
      );

      const data = interchangeToShapeData(doc);
      expect(data).toHaveLength(1);
      expect(data[0]!.type).toBe('rectangle');
      expect(data[0]!.props['x']).toBe(10);
      expect(data[0]!.props['cornerRadius']).toBe(8);
      expect(data[0]!.parentIndex).toBeNull();
    });

    test('preserves hierarchy with parent indices', () => {
      const child = createInterchangeNode('rectangle', {
        x: 10,
        y: 10,
        width: 50,
        height: 50,
      });
      const parent = createInterchangeNode('frame', {
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        children: [child],
      });
      const doc = createInterchangeDocument([parent], { source: 'test' });

      const data = interchangeToShapeData(doc);
      expect(data).toHaveLength(2);
      expect(data[0]!.type).toBe('frame');
      expect(data[0]!.parentIndex).toBeNull();
      expect(data[1]!.type).toBe('rectangle');
      expect(data[1]!.parentIndex).toBe(0);
    });

    test('converts text node with all properties', () => {
      const doc = createInterchangeDocument(
        [
          createInterchangeNode('text', {
            content: 'Hello',
            segments: [
              { text: 'Hel', color: '#FF0000' },
              { text: 'lo', fontWeight: 700 },
            ],
            textAutoResize: 'width',
            fontSize: 24,
            fontFamily: 'Arial',
            fontWeight: 700,
            fontStyle: 'italic',
            textAlign: 'center',
          }),
        ],
        { source: 'test' },
      );

      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['content']).toBe('Hello');
      expect(data[0]!.props['segments']).toEqual([
        { text: 'Hel', color: '#FF0000' },
        { text: 'lo', fontWeight: 700 },
      ]);
      expect(data[0]!.props['textAutoResize']).toBe('width');
      expect(data[0]!.props['fontSize']).toBe(24);
      expect(data[0]!.props['fontFamily']).toBe('Arial');
      expect(data[0]!.props['fontWeight']).toBe(700);
      expect(data[0]!.props['fontStyle']).toBe('italic');
      expect(data[0]!.props['textAlign']).toBe('center');
    });

    test('converts line node', () => {
      const doc = createInterchangeDocument(
        [createInterchangeNode('line', { x1: 10, y1: 20, x2: 110, y2: 120 })],
        { source: 'test' },
      );

      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['x1']).toBe(10);
      expect(data[0]!.props['y1']).toBe(20);
      expect(data[0]!.props['x2']).toBe(110);
      expect(data[0]!.props['y2']).toBe(120);
    });

    test('converts polygon node', () => {
      const doc = createInterchangeDocument([createInterchangeNode('polygon', { sides: 8 })], {
        source: 'test',
      });
      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['sides']).toBe(8);
    });

    test('converts star node', () => {
      const doc = createInterchangeDocument(
        [createInterchangeNode('star', { starPoints: 7, innerRadius: 0.5 })],
        { source: 'test' },
      );
      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['points']).toBe(7);
      expect(data[0]!.props['innerRadius']).toBe(0.5);
    });

    test('converts image node', () => {
      const doc = createInterchangeDocument(
        [createInterchangeNode('image', { src: 'http://example.com/img.png', fit: 'fit' })],
        { source: 'test' },
      );
      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['src']).toBe('http://example.com/img.png');
      expect(data[0]!.props['fit']).toBe('fit');
    });

    test('converts frame node with clipPath metadata', () => {
      const doc = createInterchangeDocument(
        [
          createInterchangeNode('frame', {
            clip: true,
            clipPath: { type: 'path', x: 4, y: 6, width: 120, height: 80, d: 'M4 6H124V86H4Z' },
          }),
        ],
        { source: 'test' },
      );

      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['clipPath']).toEqual({
        type: 'path',
        x: 4,
        y: 6,
        width: 120,
        height: 80,
        d: 'M4 6H124V86H4Z',
      });
    });

    test('converts stroke gradient from interchange to shape data', () => {
      const doc = createInterchangeDocument(
        [
          createInterchangeNode('rectangle', {
            strokes: [
              {
                color: '#000000',
                width: 2,
                opacity: 1,
                visible: true,
                gradient: {
                  type: 'linear',
                  angle: 90,
                  stops: [
                    { color: '#FF0000', position: 0 },
                    { color: '#0000FF', position: 1 },
                  ],
                },
                cap: 'butt',
                join: 'miter',
                align: 'center',
                dashPattern: 'solid',
                dashOffset: 0,
                miterLimit: 4,
              },
            ],
          }),
        ],
        { source: 'test' },
      );

      const data = interchangeToShapeData(doc);
      const strokes = data[0]!.props['strokes'] as Array<{ gradient?: { angle?: number } }>;
      expect(strokes[0]?.gradient?.angle).toBe(90);
    });

    test('converts line node with arrowheads', () => {
      const doc = createInterchangeDocument(
        [
          createInterchangeNode('line', {
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 50,
            startArrowhead: 'none',
            endArrowhead: 'triangle_arrow',
          }),
        ],
        { source: 'test' },
      );
      const data = interchangeToShapeData(doc);
      expect(data[0]!.props['startArrowhead']).toBe('none');
      expect(data[0]!.props['endArrowhead']).toBe('triangle_arrow');
    });
  });
});
