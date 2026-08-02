import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import { valueToYjs, ymapToObject } from '../src/scene-graph/yjs-utils';

function normalizedItems(key: string, value: unknown): Record<string, unknown>[] {
  const ydoc = new Y.Doc();
  const holder = ydoc.getMap('holder');
  holder.set(key, valueToYjs(key, value));
  const array = holder.get(key) as Y.Array<Y.Map<unknown>>;
  return array.toArray().map((item) => ymapToObject(item));
}

describe('valueToYjs', () => {
  test('applies schema defaults to solid fills', () => {
    expect(normalizedItems('fills', [{ color: '#00aa00' }])).toEqual([
      { color: '#00aa00', opacity: 1, visible: true },
    ]);
  });

  test('applies schema defaults to image fills that have no color', () => {
    expect(
      normalizedItems('fills', [{ imageSrc: 'https://example.com/a.png', imageFit: 'crop' }]),
    ).toEqual([
      { opacity: 1, visible: true, imageSrc: 'https://example.com/a.png', imageFit: 'crop' },
    ]);
  });

  test('applies schema defaults to gradient fills that have no color', () => {
    const gradient = {
      type: 'linear' as const,
      angle: 90,
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ffffff', position: 1 },
      ],
    };

    expect(normalizedItems('fills', [{ gradient }])).toEqual([
      { opacity: 1, visible: true, gradient },
    ]);
  });

  test('applies schema defaults to strokes', () => {
    expect(normalizedItems('strokes', [{ color: '#000000', width: 2 }])[0]).toMatchObject({
      color: '#000000',
      width: 2,
      opacity: 1,
      visible: true,
    });
  });

  test('keeps fills that define no paint source untouched', () => {
    expect(normalizedItems('fills', [{ imageFit: 'fill' }])).toEqual([{ imageFit: 'fill' }]);
  });
});
