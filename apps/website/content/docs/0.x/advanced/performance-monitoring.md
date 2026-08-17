---
title: Performance Monitoring
description: Measure editor frame times and API/database latency with Draftila's built-in metrics.
---

# Performance Monitoring

Draftila ships with opt-in instrumentation on both the API and the editor, so you can measure
where time goes on large documents instead of guessing.

## Backend Metrics

Set `METRICS_ENABLED=true` on the API to start collecting timings:

```bash
METRICS_ENABLED=true
SLOW_QUERY_MS=50
SLOW_REQUEST_MS=250
```

When enabled, the API records:

| Metric                | What it measures                                  |
| --------------------- | ------------------------------------------------- |
| `http.*`              | Per-route request duration                        |
| `db.query.*`          | Per-table query duration, split by verb           |
| `collab.load_state`   | Reading a draft's Yjs state from the database     |
| `collab.apply_state`  | Rebuilding the in-memory document from that state |
| `collab.encode_state` | Serialising the document for an autosave          |
| `collab.save_state`   | Writing the serialised document back              |
| `collab.state_bytes`  | Size of the persisted document                    |
| `collab.shape_count`  | Number of shapes in the document                  |

Queries slower than `SLOW_QUERY_MS` and requests slower than `SLOW_REQUEST_MS` are also logged to
stdout with a `[slow query]` / `[slow request]` prefix.

Read the aggregated snapshot (count, mean, p50, p95, p99, max) at:

```bash
curl http://localhost:3001/api/health/metrics
```

Clear the collected samples with:

```bash
curl -X POST http://localhost:3001/api/health/metrics/reset
```

Both endpoints return `404` while metrics are disabled.

:::note
Metrics are held in memory per process and are not persisted. Keep `METRICS_ENABLED` off in
production unless you are actively investigating a problem.
:::

## Editor Metrics

The editor collects frame timings in the browser. Enable them by adding `?perf` to the editor URL,
or from the browser console:

```js
__draftilaPerf.enable();
```

A panel appears in the top-left of the canvas showing the current frame rate, how many shapes are
being drawn out of the document total, and p50/p95 timings for the hot paths:

| Metric                    | What it measures                                         |
| ------------------------- | -------------------------------------------------------- |
| `canvas.frame`            | Total time for one render loop iteration                 |
| `canvas.shapePass`        | Time spent drawing shapes within that frame              |
| `yjs.getResolvedShapes`   | Rebuilding the shape cache after a document change       |
| `yjs.getLayerTree`        | Rebuilding the layer panel tree after a document change  |
| `yjs.rebuildSpatialCache` | Rebuilding the hit-testing index after a document change |
| `layers.flattenRows`      | Flattening the layer tree into visible rows              |

Timings are colour-coded against a 60fps budget: green under 8ms, amber under 16.7ms, red above it.

The raw numbers are available from the console for scripted comparisons:

```js
__draftilaPerf.snapshot();
__draftilaPerf.reset();
__draftilaPerf.disable();
```
