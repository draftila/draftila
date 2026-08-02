import type { Fill, Shape } from '@draftila/shared';

export type ImageLoader = (src: string) => Promise<HTMLImageElement>;

interface CacheEntry {
  image: HTMLImageElement;
  bytes: number;
}

const DEFAULT_PRELOAD_CONCURRENCY = 8;
const DEFAULT_PRELOAD_LIMIT = 500;
const DEFAULT_PRELOAD_TIMEOUT_MS = 60_000;

export interface PreloadImagesOptions {
  concurrency?: number;
  limit?: number;
  timeoutMs?: number;
}

export interface PreloadImagesResult {
  requested: number;
  loaded: number;
  failed: number;
  skipped: number;
}

const cache = new Map<string, CacheEntry>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();
const failedSources = new Set<string>();

let cacheLimitBytes = Number.POSITIVE_INFINITY;
let cachedBytes = 0;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

let loadImageSource: ImageLoader = loadImageElement;

export function setImageLoader(loader: ImageLoader) {
  loadImageSource = loader;
}

export function setImageCacheLimit(bytes: number) {
  cacheLimitBytes = bytes;
  evictOverflow();
}

function estimateBytes(image: HTMLImageElement): number {
  return Math.max(image.naturalWidth * image.naturalHeight * 4, 1);
}

function evictOverflow() {
  for (const [src, entry] of cache) {
    if (cachedBytes <= cacheLimitBytes || cache.size <= 1) return;
    cache.delete(src);
    cachedBytes -= entry.bytes;
  }
}

export function registerImage(src: string, image: HTMLImageElement) {
  const existing = cache.get(src);
  if (existing) cachedBytes -= existing.bytes;

  const bytes = estimateBytes(image);
  cache.set(src, { image, bytes });
  cachedBytes += bytes;
  failedSources.delete(src);
  evictOverflow();
}

export function getCachedImage(src: string): HTMLImageElement | null {
  const entry = cache.get(src);
  if (!entry) return null;
  cache.delete(src);
  cache.set(src, entry);
  return entry.image;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = getCachedImage(src);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLoads.get(src);
  if (pending) return pending;

  const load = loadImageSource(src).then(
    (image) => {
      pendingLoads.delete(src);
      registerImage(src, image);
      return image;
    },
    (error: unknown) => {
      pendingLoads.delete(src);
      failedSources.add(src);
      throw error;
    },
  );

  pendingLoads.set(src, load);
  return load;
}

export function resolveImage(src: string): HTMLImageElement | null {
  const cached = getCachedImage(src);
  if (cached) return cached;
  if (!failedSources.has(src)) void preloadImage(src).catch(() => null);
  return null;
}

export async function preloadImages(
  sources: string[],
  options: PreloadImagesOptions = {},
): Promise<PreloadImagesResult> {
  const concurrency = options.concurrency ?? DEFAULT_PRELOAD_CONCURRENCY;
  const limit = options.limit ?? DEFAULT_PRELOAD_LIMIT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PRELOAD_TIMEOUT_MS;

  const unique = [...new Set(sources)];
  const queue = unique.slice(0, limit);
  const expiresAt = Date.now() + timeoutMs;

  let loaded = 0;
  let failed = 0;

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let src = queue.shift(); src !== undefined; src = queue.shift()) {
      if (Date.now() >= expiresAt) return;
      const image = await preloadImage(src).catch(() => null);
      if (image) loaded++;
      else failed++;
    }
  });
  await Promise.all(workers);

  return { requested: unique.length, loaded, failed, skipped: unique.length - loaded - failed };
}

export function clearImageCache() {
  cache.clear();
  pendingLoads.clear();
  failedSources.clear();
  cachedBytes = 0;
}

export function svgToDataUri(svgContent: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
}

export function collectImageSources(shapes: Shape[]): string[] {
  const sources = new Set<string>();

  for (const shape of shapes) {
    if (shape.type === 'image' && shape.src) {
      sources.add(shape.src);
    }
    if (shape.type === 'svg' && shape.svgContent) {
      sources.add(svgToDataUri(shape.svgContent));
    }
    const fills = (shape as Shape & { fills?: Fill[] }).fills ?? [];
    for (const fill of fills) {
      if (fill.imageSrc) sources.add(fill.imageSrc);
    }
  }

  return [...sources];
}
