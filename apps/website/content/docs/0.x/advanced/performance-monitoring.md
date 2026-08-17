---
title: Performance Monitoring
description: Measure editor frame times and API/database latency with Draftila's built-in metrics.
---

# Performance Monitoring

Draftila ships with opt-in instrumentation on both the API and the editor, so you can measure
where time goes on large documents instead of guessing.

## Measured Results

All figures are from the benchmark harness in `apps/api/bench/`, run on the same machine and
documents before and after. Frontend rasterisation figures come from a CPU renderer and are
therefore pessimistic — a browser is roughly five times faster — but the ratios hold.

**Editing a 10,000-shape document**

| Operation                         | Before            | After                  |
| --------------------------------- | ----------------- | ---------------------- |
| One drag step (document rebuilds) | 76.4 ms           | 17.9 ms                |
| Adding a shape inside a frame     | 20.6 ms           | 6.1 ms                 |
| Canvas frame, zoomed in           | every shape drawn | only what is on screen |
| Canvas frame, zoomed out          | every shape drawn | one bitmap per frame   |

**Saving a 10,000-shape document**

| Operation                            | Before   | After             |
| ------------------------------------ | -------- | ----------------- |
| Autosave write (Postgres)            | 275 ms   | 0.28 ms           |
| Autosave payload                     | 8,082 KB | 0.59 KB           |
| Worst-case version history per draft | ~405 MB  | bounded at 256 MB |

The editor also stops drawing entirely when nothing has changed, so an idle document costs nothing
rather than re-rendering sixty times a second.

## Backend Metrics

Set `METRICS_ENABLED=true` on the API to start collecting timings:

```bash
METRICS_ENABLED=true
SLOW_QUERY_MS=50
SLOW_REQUEST_MS=250
```

When enabled, the API records:

| Metric                 | What it measures                                  |
| ---------------------- | ------------------------------------------------- |
| `http.*`               | Per-route request duration                        |
| `db.query.*`           | Per-table query duration, split by verb           |
| `collab.load_state`    | Reading a draft's Yjs state from the database     |
| `collab.apply_state`   | Rebuilding the in-memory document from that state |
| `collab.encode_state`  | Serialising the document for an autosave          |
| `collab.save_state`    | Writing the serialised document back              |
| `collab.append_update` | Appending one batch of edits to the update log    |
| `collab.update_bytes`  | Size of an appended batch                         |
| `collab.apply_updates` | Replaying the update log when a draft is opened   |
| `collab.state_bytes`   | Size of the persisted document                    |
| `collab.shape_count`   | Number of shapes in the document                  |

Queries slower than `SLOW_QUERY_MS` and requests slower than `SLOW_REQUEST_MS` are also logged to
stdout with a `[slow query]` / `[slow request]` prefix.

Both metrics endpoints require an authenticated administrator, because the snapshot covers the
whole server rather than any one project. Sign in first and send the session cookie:

Read the aggregated snapshot (count, mean, p50, p95, p99, max) at:

```bash
curl --cookie "$SESSION_COOKIE" http://localhost:3001/api/health/metrics
```

Clear the collected samples with:

```bash
curl -X POST --cookie "$SESSION_COOKIE" http://localhost:3001/api/health/metrics/reset
```

They return `401` without a session, `403` for a non-administrator, and `404` while metrics are
disabled. The `/api/health` liveness probe stays public.

:::note
Metrics are held in memory per process and are not persisted. Keep `METRICS_ENABLED` off in
production unless you are actively investigating a problem.
:::

## Draft Persistence

A draft's canvas is stored as a base snapshot plus an append-only log of changes. While a draft is
open, each 30-second interval appends the edits made in that window as a single small row rather
than rewriting the whole document. Once the accumulated log passes 1 MB — and when the last person
leaves the draft — the log is folded back into the base snapshot and the consumed rows are removed.

This keeps routine saves proportional to what actually changed instead of to document size. A
10,000-shape draft previously rewrote roughly 8 MB every interval; it now writes about a kilobyte.

Anything that reads a draft's full state — exports, version snapshots — reads the base plus the
log, so an actively edited draft never exports stale content. Restoring a version clears the log
first, so later edits cannot replay on top of the restored document.

## SQLite Journal Mode

On SQLite, Draftila runs in WAL mode with `synchronous = NORMAL`. This is for **read concurrency**:
in WAL mode readers do not block on a writer, so opening or exporting a draft is not held up by
another draft being saved.

It is **not** a write-latency improvement, and was measured rather than assumed. Against
full-document writes, WAL changed write latency by under 4% at every document size — the cost was
the payload, not the journal. Version history retention is likewise bounded by total bytes per
draft rather than a fixed number of auto-saves, so a large document keeps proportionally fewer
recovery points instead of consuming unbounded storage.

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
| `canvas.drawRatio`        | Share of animation frames that actually redrew           |
| `canvas.frame`            | Total time for one render loop iteration                 |
| `canvas.shapePass`        | Time spent drawing shapes within that frame              |
| `yjs.getResolvedShapes`   | Rebuilding the shape cache after a document change       |
| `yjs.getLayerTree`        | Rebuilding the layer panel tree after a document change  |
| `yjs.rebuildSpatialCache` | Rebuilding the hit-testing index after a document change |
| `layers.flattenRows`      | Flattening the layer tree into visible rows              |

Timings are colour-coded against a 60fps budget: green under 8ms, amber under 16.7ms, red above it.

## On-Demand Rendering

The canvas redraws only when something has actually changed, rather than on every animation frame.
A redraw is requested by document edits, variable and page changes, guide changes, canvas resizes,
and font or image loads completing, plus any change to camera, selection, hover, active tool or
guide visibility. While an interaction is in flight — dragging, resizing, rotating, marquee
selection, panning, node editing, an auto-layout animation or an AI shimmer — the canvas draws
continuously until it settles.

`canvas.drawRatio` reports the share of frames that actually redrew, measured over a rolling
60-frame window. Expect it near 0% on an idle editor and near 100% during an interaction. A high
ratio on an idle canvas means something is requesting redraws it should not.

The raw numbers are available from the console for scripted comparisons:

```js
__draftilaPerf.snapshot();
__draftilaPerf.reset();
__draftilaPerf.disable();
```
