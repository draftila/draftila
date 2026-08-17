import { env } from './env';

interface Histogram {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  samples: number[];
}

interface Gauge {
  count: number;
  total: number;
  min: number;
  max: number;
  last: number;
}

const MAX_SAMPLES = 512;

const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();
const counters = new Map<string, number>();

let enabled = env.METRICS_ENABLED;

export function metricsEnabled(): boolean {
  return enabled;
}

export function setMetricsEnabled(next: boolean): void {
  enabled = next;
}

export function recordDuration(name: string, durationMs: number): void {
  if (!enabled) return;

  const existing = histograms.get(name);
  if (!existing) {
    histograms.set(name, {
      count: 1,
      totalMs: durationMs,
      minMs: durationMs,
      maxMs: durationMs,
      samples: [durationMs],
    });
    return;
  }

  existing.count += 1;
  existing.totalMs += durationMs;
  if (durationMs < existing.minMs) existing.minMs = durationMs;
  if (durationMs > existing.maxMs) existing.maxMs = durationMs;
  if (existing.samples.length >= MAX_SAMPLES) existing.samples.shift();
  existing.samples.push(durationMs);
}

export function recordValue(name: string, value: number): void {
  if (!enabled) return;

  const existing = gauges.get(name);
  if (!existing) {
    gauges.set(name, { count: 1, total: value, min: value, max: value, last: value });
    return;
  }

  existing.count += 1;
  existing.total += value;
  existing.last = value;
  if (value < existing.min) existing.min = value;
  if (value > existing.max) existing.max = value;
}

export function increment(name: string, by = 1): void {
  if (!enabled) return;
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    recordDuration(name, performance.now() - start);
  }
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * quantile));
  return sorted[index] ?? 0;
}

export function metricsSnapshot() {
  const durations: Record<string, unknown> = {};
  for (const [name, histogram] of histograms) {
    const sorted = [...histogram.samples].sort((a, b) => a - b);
    durations[name] = {
      count: histogram.count,
      meanMs: Number((histogram.totalMs / histogram.count).toFixed(3)),
      p50Ms: Number(percentile(sorted, 0.5).toFixed(3)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
      p99Ms: Number(percentile(sorted, 0.99).toFixed(3)),
      minMs: Number(histogram.minMs.toFixed(3)),
      maxMs: Number(histogram.maxMs.toFixed(3)),
    };
  }

  const values: Record<string, unknown> = {};
  for (const [name, gauge] of gauges) {
    values[name] = {
      count: gauge.count,
      mean: Number((gauge.total / gauge.count).toFixed(2)),
      min: gauge.min,
      max: gauge.max,
      last: gauge.last,
    };
  }

  return {
    enabled,
    durations,
    values,
    counters: Object.fromEntries(counters),
  };
}

export function resetMetrics(): void {
  histograms.clear();
  gauges.clear();
  counters.clear();
}
