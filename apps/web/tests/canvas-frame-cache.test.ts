import { describe, expect, test } from 'bun:test';
import {
  FrameRasterCache,
  bitmapSizeFor,
  lodScaleFor,
  zoomBucketFor,
} from '@/pages/editor/hooks/canvas-frame-cache';

function bitmap(width = 10, height = 10): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

describe('FrameRasterCache', () => {
  test('returns a bitmap baked at the same bucket and text detail', () => {
    const cache = new FrameRasterCache();
    const canvas = bitmap();
    cache.set('frame', 0.25, 4, canvas, 0.5);

    expect(cache.get('frame', 0.25, 4)?.canvas).toBe(canvas);
  });

  test('misses when the text detail differs, so bitmaps never mix detail levels', () => {
    const cache = new FrameRasterCache();
    cache.set('frame', 0.25, 4, bitmap(), 0.5);

    expect(cache.get('frame', 0.25, 3)).toBeNull();
    expect(cache.get('frame', 0.25, 5)).toBeNull();
  });

  test('keeps both detail levels of one frame side by side', () => {
    const cache = new FrameRasterCache();
    const sharp = bitmap();
    const blocky = bitmap();
    cache.set('frame', 0.25, 2, sharp, 0.5);
    cache.set('frame', 0.25, 5, blocky, 0.5);

    expect(cache.get('frame', 0.25, 2)?.canvas).toBe(sharp);
    expect(cache.get('frame', 0.25, 5)?.canvas).toBe(blocky);
  });

  test('drops every detail level of a frame when it is invalidated', () => {
    const cache = new FrameRasterCache();
    cache.set('frame', 0.25, 2, bitmap(), 0.5);
    cache.set('frame', 0.25, 5, bitmap(), 0.5);
    cache.invalidate('frame');

    expect(cache.get('frame', 0.25, 2)).toBeNull();
    expect(cache.get('frame', 0.25, 5)).toBeNull();
    expect(cache.pixelCount).toBe(0);
  });

  test('replacing one detail level leaves the pixel count balanced', () => {
    const cache = new FrameRasterCache();
    cache.set('frame', 0.25, 4, bitmap(10, 10), 0.5);
    cache.set('frame', 0.25, 4, bitmap(20, 20), 0.5);

    expect(cache.pixelCount).toBe(400);
  });
});

describe('zoomBucketFor', () => {
  test('picks the first bucket at or below the zoom', () => {
    expect(zoomBucketFor(0.6)).toBe(0.5);
    expect(zoomBucketFor(0.3)).toBe(0.25);
    expect(zoomBucketFor(0.001)).toBe(0.03125);
  });
});

describe('lodScaleFor', () => {
  const CACHE_ZOOM_THRESHOLD = 0.35;
  const fontSizes = [10, 12, 14, 16, 18, 24, 32, 48];
  const thresholds = [2, 4, 5];

  test('judges directly drawn shapes at the camera zoom when nothing is cached', () => {
    expect(lodScaleFor(false, 0.25, 0.3)).toBe(0.3);
  });

  test('judges directly drawn shapes at the bitmap scale while frames are cached', () => {
    expect(lodScaleFor(true, 0.25, 0.3)).toBe(0.25);
  });

  test('never lets a cached frame and a directly drawn shape disagree about text', () => {
    for (let zoom = 0.04; zoom < CACHE_ZOOM_THRESHOLD; zoom += 0.001) {
      const bucket = zoomBucketFor(zoom);
      const direct = lodScaleFor(true, bucket, zoom);
      for (const fontSize of fontSizes) {
        for (const threshold of thresholds) {
          const bakedIsSharp = fontSize * bucket >= threshold;
          const directIsSharp = fontSize * direct >= threshold;
          expect(directIsSharp).toBe(bakedIsSharp);
        }
      }
    }
  });
});

describe('bitmapSizeFor', () => {
  test('scales by bucket and device pixel ratio', () => {
    expect(bitmapSizeFor(100, 50, 0.25, 2)).toEqual({ width: 50, height: 25, scale: 0.5 });
  });

  test('refuses bitmaps beyond the maximum edge', () => {
    expect(bitmapSizeFor(100_000, 100, 0.25, 2)).toBeNull();
  });
});
