import type { ArrowheadType, ShapeType } from '@draftila/shared';
import {
  rectToPath,
  ellipseToPath,
  polygonToPath,
  starToPath,
  lineToPath,
  arrowToPath,
} from '../path-gen';

const ID_SIZE = 21;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_SIZE));
  let id = '';
  for (let i = 0; i < ID_SIZE; i++) {
    id += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return id;
}

export function computeSvgPathForShape(
  type: ShapeType,
  props: Record<string, unknown>,
): string | undefined {
  const width = (props['width'] as number) ?? 100;
  const height = (props['height'] as number) ?? 100;

  switch (type) {
    case 'rectangle': {
      const cr = (props['cornerRadius'] as number) ?? 0;
      const cornerSmoothing = (props['cornerSmoothing'] as number) ?? 0;
      const tl = (props['cornerRadiusTL'] as number) ?? cr;
      const tr = (props['cornerRadiusTR'] as number) ?? cr;
      const br = (props['cornerRadiusBR'] as number) ?? cr;
      const bl = (props['cornerRadiusBL'] as number) ?? cr;
      const hasIndependent =
        props['cornerRadiusTL'] !== undefined ||
        props['cornerRadiusTR'] !== undefined ||
        props['cornerRadiusBL'] !== undefined ||
        props['cornerRadiusBR'] !== undefined;
      return rectToPath(width, height, hasIndependent ? [tl, tr, br, bl] : cr, cornerSmoothing);
    }
    case 'ellipse':
      return ellipseToPath(width, height);
    case 'polygon': {
      const sides = (props['sides'] as number) ?? 6;
      return polygonToPath(width, height, sides);
    }
    case 'star': {
      const points = (props['points'] as number) ?? 5;
      const innerRadius = (props['innerRadius'] as number) ?? 0.38;
      return starToPath(width, height, points, innerRadius);
    }
    case 'line': {
      const ox = (props['x'] as number) ?? 0;
      const oy = (props['y'] as number) ?? 0;
      const x1 = ((props['x1'] as number) ?? 0) - ox;
      const y1 = ((props['y1'] as number) ?? 0) - oy;
      const x2 = ((props['x2'] as number) ?? width) - ox;
      const y2 = ((props['y2'] as number) ?? 0) - oy;
      const startHead = (props['startArrowhead'] as ArrowheadType) ?? 'none';
      const endHead = (props['endArrowhead'] as ArrowheadType) ?? 'none';
      if (startHead === 'none' && endHead === 'none') {
        return lineToPath(x1, y1, x2, y2);
      }
      const sw = 2;
      return arrowToPath(x1, y1, x2, y2, sw, startHead, endHead);
    }
    default:
      return undefined;
  }
}

export const SHAPE_DEFAULTS: Record<ShapeType, Omit<Record<string, unknown>, 'id' | 'type'>> = {
  rectangle: {
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    cornerRadius: 0,
    cornerSmoothing: 0,
    shadows: [],
    blurs: [],
  },
  ellipse: {
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  frame: {
    fills: [{ color: '#FFFFFF', opacity: 1, visible: true }],
    strokes: [],
    clip: true,
    shadows: [],
    blurs: [],
    guides: [],
    layoutMode: 'none',
    layoutGap: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    layoutAlign: 'start',
    layoutJustify: 'start',
    layoutSizingHorizontal: 'fixed',
    layoutSizingVertical: 'fixed',
  },
  text: {
    content: '',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'center',
    verticalAlign: 'middle',
    textAutoResize: 'width',
    lineHeight: 1.2,
    letterSpacing: 0,
    textDecoration: 'none',
    textTransform: 'none',
    fills: [{ color: '#000000', opacity: 1, visible: true }],
    shadows: [],
    blurs: [],
  },
  path: {
    points: [],
    fills: [{ color: '#000000', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  line: {
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    strokes: [{ color: '#000000', width: 2, opacity: 1, visible: true }],
    startArrowhead: 'none',
    endArrowhead: 'none',
    shadows: [],
    blurs: [],
  },
  polygon: {
    sides: 6,
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },
  star: {
    points: 5,
    innerRadius: 0.38,
    fills: [{ color: '#D9D9D9', opacity: 1, visible: true }],
    strokes: [],
    shadows: [],
    blurs: [],
  },

  image: {
    src: '',
    fit: 'fill',
    shadows: [],
    blurs: [],
  },
  svg: {
    svgContent: '',
    preserveAspectRatio: 'xMidYMid meet',
    shadows: [],
    blurs: [],
  },
  group: {
    shadows: [],
    blurs: [],
  },
};

export const BASE_DEFAULTS = {
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
  layoutSizingHorizontal: 'fixed',
  layoutSizingVertical: 'fixed',
  constraintHorizontal: 'left',
  constraintVertical: 'top',
};

export const PATH_AFFECTING_KEYS = new Set([
  'width',
  'height',
  'cornerRadius',
  'cornerRadiusTL',
  'cornerRadiusTR',
  'cornerRadiusBL',
  'cornerRadiusBR',
  'cornerSmoothing',
  'sides',
  'innerRadius',
  'x1',
  'y1',
  'x2',
  'y2',
  'startArrowhead',
  'endArrowhead',
]);
