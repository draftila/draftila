const ZOOM_BUCKETS = [0.5, 0.25, 0.125, 0.0625, 0.03125] as const;
const PIXEL_BUDGET = 48_000_000;
const MAX_BITMAP_EDGE = 4096;

export interface CachedFrame {
  canvas: HTMLCanvasElement;
  scale: number;
}

interface CacheEntry extends CachedFrame {
  key: string;
  frameId: string;
  pixels: number;
}

function cacheKey(frameId: string, bucket: number, textLegibilityPx: number): string {
  return `${frameId}:${bucket}:${textLegibilityPx}`;
}

export function lodScaleFor(cacheEngaged: boolean, bucket: number, zoom: number): number {
  return cacheEngaged ? bucket : zoom;
}

export function zoomBucketFor(zoom: number): number {
  for (const bucket of ZOOM_BUCKETS) {
    if (zoom >= bucket) return bucket;
  }
  return ZOOM_BUCKETS[ZOOM_BUCKETS.length - 1]!;
}

export class FrameRasterCache {
  private entries = new Map<string, CacheEntry>();
  private byFrame = new Map<string, Set<string>>();
  private pixels = 0;

  get(frameId: string, bucket: number, textLegibilityPx: number): CachedFrame | null {
    const key = cacheKey(frameId, bucket, textLegibilityPx);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(
    frameId: string,
    bucket: number,
    textLegibilityPx: number,
    canvas: HTMLCanvasElement,
    scale: number,
  ): void {
    const key = cacheKey(frameId, bucket, textLegibilityPx);
    this.dropKey(key);

    const pixels = canvas.width * canvas.height;
    const entry: CacheEntry = { key, frameId, canvas, scale, pixels };
    this.entries.set(key, entry);
    this.pixels += pixels;

    const keys = this.byFrame.get(frameId);
    if (keys) keys.add(key);
    else this.byFrame.set(frameId, new Set([key]));

    this.evict();
  }

  invalidate(frameId: string): void {
    const keys = this.byFrame.get(frameId);
    if (!keys) return;
    for (const key of keys) this.dropKey(key, true);
    this.byFrame.delete(frameId);
  }

  invalidateAll(): void {
    this.entries.clear();
    this.byFrame.clear();
    this.pixels = 0;
  }

  get pixelCount(): number {
    return this.pixels;
  }

  private dropKey(key: string, skipFrameIndex = false): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.entries.delete(key);
    this.pixels -= existing.pixels;
    if (skipFrameIndex) return;
    this.byFrame.get(existing.frameId)?.delete(key);
  }

  private evict(): void {
    while (this.pixels > PIXEL_BUDGET) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.dropKey(oldest.value);
    }
  }
}

export function bitmapSizeFor(
  width: number,
  height: number,
  bucket: number,
  dpr: number,
): { width: number; height: number; scale: number } | null {
  const scale = bucket * dpr;
  const pixelWidth = Math.ceil(width * scale);
  const pixelHeight = Math.ceil(height * scale);

  if (pixelWidth <= 0 || pixelHeight <= 0) return null;
  if (pixelWidth > MAX_BITMAP_EDGE || pixelHeight > MAX_BITMAP_EDGE) return null;

  return { width: pixelWidth, height: pixelHeight, scale };
}
