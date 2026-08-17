export interface Timing {
  label: string;
  n: number;
  runs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
}

export function summarize(label: string, n: number, samples: number[]): Timing {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((acc, value) => acc + value, 0);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    label,
    n,
    runs: samples.length,
    meanMs: total / samples.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    totalMs: total,
  };
}

export function measure(label: string, n: number, runs: number, fn: () => void): Timing {
  for (let i = 0; i < Math.min(3, runs); i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return summarize(label, n, samples);
}

export async function measureAsync(
  label: string,
  n: number,
  runs: number,
  fn: () => Promise<void>,
): Promise<Timing> {
  for (let i = 0; i < Math.min(2, runs); i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return summarize(label, n, samples);
}

export function formatTable(rows: Timing[]): string {
  const header = ['metric', 'items', 'runs', 'mean ms', 'p50 ms', 'p95 ms', 'max ms'];
  const body = rows.map((row) => [
    row.label,
    String(row.n),
    String(row.runs),
    row.meanMs.toFixed(3),
    row.p50Ms.toFixed(3),
    row.p95Ms.toFixed(3),
    row.maxMs.toFixed(3),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...body.map((line) => (line[index] ?? '').length)),
  );
  const render = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ');
  return [render(header), widths.map((width) => '-'.repeat(width)).join('  '), ...body.map(render)]
    .join('\n')
    .concat('\n');
}
