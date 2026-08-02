import { describe, test, expect, beforeEach } from 'bun:test';
import type { Shape } from '@draftila/shared';
import {
  clearImageCache,
  collectImageSources,
  getCachedImage,
  preloadImage,
  preloadImages,
  registerImage,
  resolveImage,
  setImageCacheLimit,
  setImageLoader,
  svgToDataUri,
} from '../src/image-cache';

function fakeImage(size = 1): HTMLImageElement {
  return { naturalWidth: size, naturalHeight: size } as unknown as HTMLImageElement;
}

function shape(props: Record<string, unknown>): Shape {
  return {
    id: 'shape',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    ...props,
  } as unknown as Shape;
}

describe('image-cache', () => {
  beforeEach(() => {
    clearImageCache();
    setImageCacheLimit(Number.POSITIVE_INFINITY);
    setImageLoader((src) => Promise.resolve(fakeImage(src.length)));
  });

  test('caches loaded images and reuses them', async () => {
    let loads = 0;
    setImageLoader(() => {
      loads++;
      return Promise.resolve(fakeImage());
    });

    await preloadImage('a.png');
    await preloadImage('a.png');

    expect(loads).toBe(1);
    expect(getCachedImage('a.png')).not.toBeNull();
  });

  test('deduplicates concurrent loads of the same source', async () => {
    let loads = 0;
    setImageLoader(() => {
      loads++;
      return Promise.resolve(fakeImage());
    });

    await Promise.all([preloadImage('a.png'), preloadImage('a.png')]);

    expect(loads).toBe(1);
  });

  test('does not cache images that fail to load', async () => {
    setImageLoader(() => Promise.reject(new Error('boom')));

    await expect(preloadImage('broken.png')).rejects.toThrow('boom');
    expect(getCachedImage('broken.png')).toBeNull();
  });

  test('resolveImage requests a missing image once and stops retrying after failure', async () => {
    let loads = 0;
    setImageLoader(() => {
      loads++;
      return Promise.reject(new Error('boom'));
    });

    expect(resolveImage('broken.png')).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveImage('broken.png')).toBeNull();
    expect(resolveImage('broken.png')).toBeNull();

    expect(loads).toBe(1);
  });

  test('resolveImage returns the image once it is loaded', async () => {
    await preloadImage('a.png');
    expect(resolveImage('a.png')).not.toBeNull();
  });

  test('registerImage makes an image available without loading it', () => {
    setImageLoader(() => Promise.reject(new Error('should not load')));
    registerImage('local.png', fakeImage());

    expect(resolveImage('local.png')).not.toBeNull();
  });

  test('evicts least recently used images once the byte limit is exceeded', async () => {
    setImageCacheLimit(8);
    setImageLoader(() => Promise.resolve(fakeImage()));

    await preloadImage('a.png');
    await preloadImage('b.png');
    getCachedImage('a.png');
    await preloadImage('c.png');

    expect(getCachedImage('b.png')).toBeNull();
    expect(getCachedImage('a.png')).not.toBeNull();
    expect(getCachedImage('c.png')).not.toBeNull();
  });

  test('keeps a single image cached even when it exceeds the limit', async () => {
    setImageCacheLimit(1);
    setImageLoader(() => Promise.resolve(fakeImage(100)));

    await preloadImage('big.png');

    expect(getCachedImage('big.png')).not.toBeNull();
  });

  test('preloadImages loads every source and swallows failures', async () => {
    const loaded: string[] = [];
    setImageLoader((src) => {
      loaded.push(src);
      return src === 'bad.png' ? Promise.reject(new Error('boom')) : Promise.resolve(fakeImage());
    });

    await preloadImages(['a.png', 'b.png', 'bad.png', 'a.png'], 2);

    expect(loaded.toSorted()).toEqual(['a.png', 'b.png', 'bad.png']);
    expect(getCachedImage('b.png')).not.toBeNull();
    expect(getCachedImage('bad.png')).toBeNull();
  });

  test('collects image sources from image shapes, svg shapes and image fills', () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
    const sources = collectImageSources([
      shape({ id: 'a', type: 'image', src: 'https://example.com/a.png' }),
      shape({ id: 'b', type: 'svg', svgContent }),
      shape({ id: 'c', fills: [{ imageSrc: 'https://example.com/b.png', visible: true }] }),
      shape({ id: 'd', fills: [{ color: '#ffffff', opacity: 1, visible: true }] }),
      shape({ id: 'e', type: 'image', src: 'https://example.com/a.png' }),
    ]);

    expect(sources).toEqual([
      'https://example.com/a.png',
      svgToDataUri(svgContent),
      'https://example.com/b.png',
    ]);
  });

  test('ignores shapes without image sources', () => {
    expect(
      collectImageSources([shape({ type: 'image', src: '' }), shape({ type: 'svg' })]),
    ).toEqual([]);
  });
});
