import * as Y from 'yjs';
import {
  fillSchema,
  strokeSchema,
  shadowSchema,
  blurSchema,
  layoutGuideSchema,
} from '@draftila/shared';

const ARRAY_OF_OBJECTS_KEYS = new Set([
  'points',
  'fills',
  'strokes',
  'shadows',
  'blurs',
  'guides',
  'segments',
]);

const ARRAY_ITEM_SCHEMAS: Record<
  string,
  { safeParse: (data: unknown) => { success: boolean; data?: unknown } }
> = {
  fills: fillSchema,
  strokes: strokeSchema,
  shadows: shadowSchema,
  blurs: blurSchema,
  guides: layoutGuideSchema,
};

export function objectToYMap(obj: Record<string, unknown>): Y.Map<unknown> {
  const yMap = new Y.Map();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      yMap.set(k, objectToYMap(v as Record<string, unknown>));
    } else if (Array.isArray(v)) {
      const yArr = new Y.Array();
      for (const item of v) {
        if (item !== null && typeof item === 'object') {
          yArr.push([objectToYMap(item as Record<string, unknown>)]);
        } else {
          yArr.push([item]);
        }
      }
      yMap.set(k, yArr);
    } else {
      yMap.set(k, v);
    }
  }
  return yMap;
}

function normalizeArrayItem(key: string, item: unknown): Record<string, unknown> {
  const schema = ARRAY_ITEM_SCHEMAS[key];
  if (!schema) return item as Record<string, unknown>;
  const parsed = schema.safeParse(item);
  if (parsed.success) return parsed.data as Record<string, unknown>;
  return item as Record<string, unknown>;
}

export function valueToYjs(key: string, value: unknown): unknown {
  if (ARRAY_OF_OBJECTS_KEYS.has(key) && Array.isArray(value)) {
    const yArray = new Y.Array();
    for (const item of value) {
      const normalized = normalizeArrayItem(key, item);
      yArray.push([objectToYMap(normalized)]);
    }
    return yArray;
  }
  return value;
}

export function ymapToObject(ymap: Y.Map<unknown>): Record<string, unknown> {
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
