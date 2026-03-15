import * as Y from 'yjs';
import type { Shape, ShapeType } from '@draftila/shared';

const ID_SIZE = 21;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_SIZE));
  let id = '';
  for (let i = 0; i < ID_SIZE; i++) {
    id += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return id;
}

const ARRAY_OF_OBJECTS_KEYS = new Set(['points', 'fills', 'strokes', 'shadows', 'blurs', 'guides']);

function valueToYjs(key: string, value: unknown): unknown {
  if (ARRAY_OF_OBJECTS_KEYS.has(key) && Array.isArray(value)) {
    const yArray = new Y.Array();
    for (const item of value) {
      const yMap = new Y.Map();
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        yMap.set(k, v);
      }
      yArray.push([yMap]);
    }
    return yArray;
  }
  return value;
}

const SHAPE_DEFAULTS: Record<ShapeType, Omit<Record<string, unknown>, 'id' | 'type'>> = {
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
  },
  text: {
    content: '',
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
  arrow: {
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    strokes: [{ color: '#000000', width: 2, opacity: 1, visible: true }],
    startArrowhead: false,
    endArrowhead: true,
    shadows: [],
    blurs: [],
  },
  image: {
    src: '',
    fit: 'fill',
    shadows: [],
    blurs: [],
  },
  group: {
    shadows: [],
    blurs: [],
  },
};

const BASE_DEFAULTS = {
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
};

export function initDocument(ydoc: Y.Doc) {
  ydoc.getMap('shapes');
  ydoc.getArray<string>('zOrder');
  ydoc.getMap('meta');
}

export function getShapesMap(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return ydoc.getMap('shapes') as Y.Map<Y.Map<unknown>>;
}

export function getZOrder(ydoc: Y.Doc): Y.Array<string> {
  return ydoc.getArray<string>('zOrder');
}

export function addShape(ydoc: Y.Doc, type: ShapeType, props: Partial<Shape> = {}): string {
  const id = generateId();
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const typeDefaults = SHAPE_DEFAULTS[type] ?? {};

  const shapeData = new Y.Map<unknown>();

  ydoc.transact(() => {
    const merged = {
      ...BASE_DEFAULTS,
      ...typeDefaults,
      ...props,
      id,
      type,
      name: props.name || type,
    };

    for (const [key, value] of Object.entries(merged)) {
      shapeData.set(key, valueToYjs(key, value));
    }

    shapes.set(id, shapeData);
    zOrder.push([id]);
  });

  return id;
}

export function updateShape(ydoc: Y.Doc, id: string, props: Partial<Shape>) {
  const shapes = getShapesMap(ydoc);
  const shapeData = shapes.get(id);
  if (!shapeData) return;

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'id' || key === 'type') continue;
      shapeData.set(key, valueToYjs(key, value));
    }
  });
}

export function deleteShape(ydoc: Y.Doc, id: string) {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);

  ydoc.transact(() => {
    shapes.delete(id);
    for (let i = 0; i < zOrder.length; i++) {
      if (zOrder.get(i) === id) {
        zOrder.delete(i, 1);
        break;
      }
    }
  });
}

export function deleteShapes(ydoc: Y.Doc, ids: string[]) {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const idSet = new Set(ids);

  ydoc.transact(() => {
    for (const id of ids) {
      shapes.delete(id);
    }
    for (let i = zOrder.length - 1; i >= 0; i--) {
      if (idSet.has(zOrder.get(i))) {
        zOrder.delete(i, 1);
      }
    }
  });
}

function ymapToObject(ymap: Y.Map<unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  ymap.forEach((value, key) => {
    if (value instanceof Y.Map) {
      obj[key] = ymapToObject(value);
    } else if (value instanceof Y.Array) {
      obj[key] = value.toArray().map((item) => {
        if (item instanceof Y.Map) return ymapToObject(item);
        return item;
      });
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

export function getShape(ydoc: Y.Doc, id: string): Shape | null {
  const shapes = getShapesMap(ydoc);
  const shapeData = shapes.get(id);
  if (!shapeData) return null;
  return ymapToObject(shapeData) as Shape;
}

export function getAllShapes(ydoc: Y.Doc): Shape[] {
  const shapes = getShapesMap(ydoc);
  const zOrder = getZOrder(ydoc);
  const result: Shape[] = [];

  for (let i = 0; i < zOrder.length; i++) {
    const id = zOrder.get(i);
    const shapeData = shapes.get(id);
    if (shapeData) {
      result.push(ymapToObject(shapeData) as Shape);
    }
  }

  return result;
}

export function getShapeCount(ydoc: Y.Doc): number {
  return getShapesMap(ydoc).size;
}

export type ShapeChangeCallback = (changes: {
  added: string[];
  updated: string[];
  deleted: string[];
}) => void;

export function observeShapes(ydoc: Y.Doc, callback: ShapeChangeCallback): () => void {
  const shapes = getShapesMap(ydoc);

  const handleShapeMapChange = (events: Y.YEvent<Y.Map<unknown>>[]) => {
    const added: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];

    for (const event of events) {
      if (event.target === shapes) {
        event.changes.keys.forEach((change, key) => {
          if (change.action === 'add') added.push(key);
          else if (change.action === 'delete') deleted.push(key);
          else if (change.action === 'update') updated.push(key);
        });
      } else {
        const id = event.target.get('id') as string | undefined;
        if (id && !updated.includes(id)) {
          updated.push(id);
        }
      }
    }

    if (added.length > 0 || updated.length > 0 || deleted.length > 0) {
      callback({ added, updated, deleted });
    }
  };

  shapes.observeDeep(handleShapeMapChange);
  return () => shapes.unobserveDeep(handleShapeMapChange);
}
