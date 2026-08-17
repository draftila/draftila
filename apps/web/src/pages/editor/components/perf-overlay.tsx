import { useEffect, useState } from 'react';
import { getPerfSnapshot, isPerfEnabled, type PerfSnapshot } from '@/lib/perf-metrics';

const REFRESH_MS = 500;

const TRACKED_SERIES = [
  'canvas.frame',
  'canvas.shapePass',
  'yjs.getResolvedShapes',
  'yjs.getLayerTree',
  'yjs.rebuildSpatialCache',
  'layers.flattenRows',
];

function frameBudgetColor(p95: number): string {
  if (p95 <= 8) return 'text-emerald-400';
  if (p95 <= 16.7) return 'text-amber-400';
  return 'text-red-400';
}

export function PerfOverlay() {
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    if (!isPerfEnabled()) return;
    const interval = setInterval(() => setSnapshot(getPerfSnapshot()), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  if (!snapshot) return null;

  const frame = snapshot.series['canvas.frame'];
  const total = snapshot.values['shapes.total'] ?? 0;
  const drawn = snapshot.values['shapes.drawn'] ?? 0;

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-50 w-72 rounded-md bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-white shadow-lg">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-semibold">Performance</span>
        <span className={frameBudgetColor(frame?.p95Ms ?? 0)}>{snapshot.fps} fps</span>
      </div>
      <div className="mb-2 text-white/70">
        shapes {drawn}/{total} drawn · layer rows {snapshot.values['layers.rows'] ?? 0}
      </div>
      <div className="mb-2 text-white/70">
        frames drawn {((snapshot.values['canvas.drawRatio'] ?? 0) * 100).toFixed(0)}% · text LOD{' '}
        {snapshot.values['canvas.textLegibilityPx'] ?? 0}px
      </div>
      <table className="w-full">
        <thead className="text-white/50">
          <tr>
            <th className="text-left font-normal">metric</th>
            <th className="text-right font-normal">p50</th>
            <th className="text-right font-normal">p95</th>
          </tr>
        </thead>
        <tbody>
          {TRACKED_SERIES.map((name) => {
            const entry = snapshot.series[name];
            if (!entry) return null;
            return (
              <tr key={name}>
                <td className="truncate pr-2">{name.replace(/^(canvas|yjs|layers)\./, '')}</td>
                <td className="text-right tabular-nums">{entry.p50Ms.toFixed(2)}</td>
                <td className={`text-right tabular-nums ${frameBudgetColor(entry.p95Ms)}`}>
                  {entry.p95Ms.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
