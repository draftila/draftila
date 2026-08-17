const SAMPLE_WINDOW = 180;
const STORAGE_KEY = 'draftila:perf';

interface Series {
  samples: number[];
  count: number;
  total: number;
  max: number;
}

export interface SeriesSummary {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface PerfSnapshot {
  enabled: boolean;
  fps: number;
  series: Record<string, SeriesSummary>;
  values: Record<string, number>;
}

const series = new Map<string, Series>();
const values = new Map<string, number>();

let enabled = false;

function readInitialFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === 'on') return true;
  } catch {
    return false;
  }
  return new URLSearchParams(window.location.search).has('perf');
}

export function isPerfEnabled(): boolean {
  return enabled;
}

export function setPerfEnabled(next: boolean): void {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    return;
  }
}

export function record(name: string, durationMs: number): void {
  if (!enabled) return;
  const existing = series.get(name);
  if (!existing) {
    series.set(name, { samples: [durationMs], count: 1, total: durationMs, max: durationMs });
    return;
  }
  existing.count += 1;
  existing.total += durationMs;
  if (durationMs > existing.max) existing.max = durationMs;
  if (existing.samples.length >= SAMPLE_WINDOW) existing.samples.shift();
  existing.samples.push(durationMs);
}

export function measure<T>(name: string, fn: () => T): T {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(name, performance.now() - start);
  }
}

export function setValue(name: string, value: number): void {
  if (!enabled) return;
  values.set(name, value);
}

function summarize(entry: Series): SeriesSummary {
  const sorted = [...entry.samples].sort((a, b) => a - b);
  const at = (quantile: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 0;
  return {
    count: entry.count,
    meanMs: Number((entry.total / entry.count).toFixed(3)),
    p50Ms: Number(at(0.5).toFixed(3)),
    p95Ms: Number(at(0.95).toFixed(3)),
    maxMs: Number(entry.max.toFixed(3)),
  };
}

export function getPerfSnapshot(): PerfSnapshot {
  const summaries: Record<string, SeriesSummary> = {};
  for (const [name, entry] of series) {
    summaries[name] = summarize(entry);
  }
  const frame = series.get('canvas.frame');
  const frameSamples = frame?.samples ?? [];
  const meanFrame =
    frameSamples.length > 0
      ? frameSamples.reduce((acc, value) => acc + value, 0) / frameSamples.length
      : 0;

  return {
    enabled,
    fps: meanFrame > 0 ? Number((1000 / meanFrame).toFixed(1)) : 0,
    series: summaries,
    values: Object.fromEntries(values),
  };
}

export function resetPerf(): void {
  series.clear();
  values.clear();
}

enabled = readInitialFlag();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__draftilaPerf'] = {
    snapshot: getPerfSnapshot,
    reset: resetPerf,
    enable: () => setPerfEnabled(true),
    disable: () => setPerfEnabled(false),
  };
}
