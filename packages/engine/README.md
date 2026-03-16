# @draftila/engine

Framework-agnostic 2D design engine. Provides scene graph management, rendering, hit testing, tools, history, clipboard, and more — all built on top of [Yjs](https://yjs.dev) for real-time collaboration.

## Installation

```bash
bun add @draftila/engine
```

Peer dependency: `@draftila/shared` (for shape/camera/tool type definitions).

> **Note:** This package exports raw TypeScript files. Your bundler must support TypeScript resolution (Vite, Bun, esbuild, etc.).

## Quick Start

```ts
import * as Y from 'yjs';
import {
  initDocument,
  addShape,
  getAllShapes,
  configureToolStore,
  getTool,
} from '@draftila/engine';

// 1. Create a Yjs document and initialize the scene graph
const ydoc = new Y.Doc();
initDocument(ydoc);

// 2. Add shapes
const id = addShape(ydoc, 'rectangle', {
  x: 100,
  y: 50,
  width: 200,
  height: 150,
  fill: '#3B82F6',
});

// 3. Query shapes
const shapes = getAllShapes(ydoc);
```

## Tool System

Tools (move, rectangle, pen, etc.) need to read/write UI state like selection and camera. Instead of coupling to a specific state library, the engine defines a `ToolStore` interface that you implement.

```ts
import { configureToolStore, type ToolStore } from '@draftila/engine';

const store: ToolStore = {
  get selectedIds() {
    return myState.selectedIds;
  },
  get camera() {
    return myState.camera;
  },
  setSelectedIds(ids) {
    myState.selectedIds = ids;
  },
  setActiveTool(tool) {
    myState.activeTool = tool;
  },
  setIsDrawing(v) {
    myState.isDrawing = v;
  },
  setIsPanning(v) {
    myState.isPanning = v;
  },
  toggleSelection(id) {
    /* ... */
  },
  clearSelection() {
    /* ... */
  },
  setHoveredId(id) {
    /* ... */
  },
  setCamera(cam) {
    /* ... */
  },
};

// Call once at app startup, before using any tools
configureToolStore(store);
```

Then use tools normally:

```ts
import { getTool } from '@draftila/engine/tools/tool-manager';

const tool = getTool('rectangle');
tool.onPointerDown(toolContext);
tool.onPointerMove(toolContext);
tool.onPointerUp(toolContext);
```

## Modules

| Module                | Import                               | Description                                                                                                   |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Scene Graph**       | `@draftila/engine/scene-graph`       | CRDT-backed shape storage via Yjs (`addShape`, `updateShape`, `deleteShape`, `getAllShapes`, `observeShapes`) |
| **Camera**            | `@draftila/engine/camera`            | Pan, zoom, coordinate transforms (`screenToCanvas`, `canvasToScreen`, `zoomAtPoint`, `zoomToFit`)             |
| **Selection**         | `@draftila/engine/selection`         | Selection bounds, resize handles, alignment, distribution                                                     |
| **Hit Test**          | `@draftila/engine/hit-test`          | Point and rectangle hit testing against shapes                                                                |
| **Spatial Index**     | `@draftila/engine/spatial-index`     | R-tree powered spatial queries                                                                                |
| **Shape Renderer**    | `@draftila/engine/shape-renderer`    | Renders shapes to a `Renderer` interface                                                                      |
| **Renderer**          | `@draftila/engine/renderer`          | `Renderer` interface definition                                                                               |
| **Canvas2D Renderer** | `@draftila/engine/renderer/canvas2d` | `Canvas2DRenderer` implementation                                                                             |
| **History**           | `@draftila/engine/history`           | Undo/redo via `Y.UndoManager`                                                                                 |
| **Clipboard**         | `@draftila/engine/clipboard`         | Copy, paste, cut, duplicate shapes                                                                            |
| **Figma Clipboard**   | `@draftila/engine/figma-clipboard`   | Figma clipboard interop and SVG import/export                                                                 |
| **Export**            | `@draftila/engine/export`            | PNG and SVG export                                                                                            |
| **Auto Layout**       | `@draftila/engine/auto-layout`       | Flexbox-like auto layout computation                                                                          |
| **Constraints**       | `@draftila/engine/constraints`       | Responsive constraints (pin edges, scale, center)                                                             |
| **Boolean Ops**       | `@draftila/engine/boolean-ops`       | Boolean operation bounds (union, intersect, subtract)                                                         |
| **Components**        | `@draftila/engine/components`        | Reusable component definitions and instances                                                                  |
| **Pages**             | `@draftila/engine/pages`             | Multi-page document support                                                                                   |
| **Image Manager**     | `@draftila/engine/image-manager`     | Image loading, caching, and file drop handling                                                                |
| **Tools**             | `@draftila/engine/tools/*`           | Move, rectangle, ellipse, frame, text, pen, line, arrow, polygon, star, hand tools                            |

## Rendering

The engine uses a `Renderer` interface, making it renderer-agnostic. A Canvas2D implementation is included:

```ts
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { renderShape } from '@draftila/engine/shape-renderer';

const renderer = new Canvas2DRenderer(canvas);
renderer.resize(width, height, devicePixelRatio);
renderer.clear();
renderer.save();
renderer.applyCamera(camera);

for (const shape of shapes) {
  renderShape(renderer, shape);
}

renderer.restore();
```

Implement the `Renderer` interface from `@draftila/engine/renderer` to add WebGL, SVG, or other backends.

## Dependencies

- [`yjs`](https://github.com/yjs/yjs) — CRDT for real-time collaboration
- [`rbush`](https://github.com/mourner/rbush) — R-tree spatial index
- [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand) — Freehand stroke rendering
- [`pako`](https://github.com/nodeca/pako) — Figma clipboard decompression
- [`@draftila/shared`](../shared) — Shared type definitions
