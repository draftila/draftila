# MCP Architecture: Browser-Delegated Canvas Operations

## Overview

All canvas operations (shape creation, updates, layout, rendering) are delegated from the MCP API server to the browser editor via WebSocket RPC. The API server acts as a thin proxy — it authenticates the request, validates draft access, and forwards the command to the browser. The browser executes the operation on its local Yjs document and returns the result.

This ensures:

- Text measurement, auto-layout, and rendering all happen in the browser where Canvas/DOM APIs are available
- The user sees changes in real-time as the AI agent works
- PNG export works reliably (browser renders to offscreen canvas)
- No server-side browser API stubs or workarounds needed

## Flow

```
AI Agent (Claude Code)
    |
    | MCP protocol (HTTP)
    v
API Server (Hono + Bun)
    |
    | 1. Authenticate via API key
    | 2. Validate draft access
    | 3. Check browser is connected
    | 4. Forward command via WebSocket RPC
    v
Collaboration Service (WebSocket)
    |
    | MESSAGE_RPC (type 2) binary frame
    | Payload: { id, tool, args }
    v
Browser Editor Tab (React)
    |
    | use-rpc.ts hook intercepts MESSAGE_RPC
    | Dispatches to handler (e.g. create_shape, export_png)
    | Executes on local Yjs doc (auto-syncs to all clients)
    | Returns result via MESSAGE_RPC response
    v
API Server resolves Promise
    |
    | MCP tool response
    v
AI Agent receives result
```

## What stays on the API

| Tool          | Why                              |
| ------------- | -------------------------------- |
| `list_drafts` | Database query, no canvas needed |

All other tools are forwarded to the browser via RPC.

## What moves to the browser

| Tool                  | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `create_shape`        | Adds shape to Yjs doc, applies auto-layout, returns new ID              |
| `batch_create_shapes` | Creates multiple shapes with `$N` parent refs, applies layout bottom-up |
| `get_shape`           | Reads shape data from Yjs doc                                           |
| `update_shape`        | Updates shape properties, applies auto-layout                           |
| `batch_update_shapes` | Updates multiple shapes, applies auto-layout                            |
| `delete_shapes`       | Deletes shapes, recomputes parent layouts                               |
| `list_shapes`         | Lists all shapes or children of a parent                                |
| `duplicate_shapes`    | Duplicates shapes in place                                              |
| `group_shapes`        | Groups shapes                                                           |
| `ungroup_shapes`      | Ungroups shapes                                                         |
| `frame_selection`     | Wraps shapes in a frame                                                 |
| `align_shapes`        | Aligns shapes relative to each other                                    |
| `distribute_shapes`   | Distributes shapes evenly                                               |
| `apply_auto_layout`   | Recomputes auto-layout on a frame                                       |
| `nudge_shapes`        | Moves shapes by offset                                                  |
| `flip_shapes`         | Flips shapes on axis                                                    |
| `move_in_stack`       | Reorders z-index                                                        |
| `move_by_drop`        | Reparents/reorders shapes                                               |
| `boolean_operation`   | Boolean ops on overlapping shapes                                       |
| `create_component`    | Creates a reusable component                                            |
| `create_instance`     | Creates component instance                                              |
| `list_components`     | Lists all components                                                    |
| `remove_component`    | Removes a component                                                     |
| `export_svg`          | Generates SVG string                                                    |
| `export_png`          | **New** - Renders to offscreen canvas, returns base64 PNG               |
| `import_svg`          | Parses SVG and creates shapes                                           |
| `list_guides`         | Lists ruler guides                                                      |
| `add_guide`           | Adds a ruler guide                                                      |
| `remove_guide`        | Removes a ruler guide                                                   |

## RPC Protocol

Uses the existing `MESSAGE_RPC = 2` binary encoding over WebSocket (already implemented in `collaboration.service.ts`):

### Request (server -> browser)

```
[VarUint: 2] [VarString: JSON]
JSON: { "id": "unique-id", "tool": "create_shape", "args": { ... } }
```

### Response (browser -> server)

```
[VarUint: 2] [VarString: JSON]
JSON: { "id": "unique-id", "result": { ... } }
  or: { "id": "unique-id", "error": "error message" }
```

### Timeout

30 seconds (configurable via `RPC_TIMEOUT_MS`). If the browser doesn't respond, the MCP tool returns an error.

## Browser-side RPC Handler

New hook: `apps/web/src/pages/editor/hooks/use-rpc.ts`

- Intercepts `MESSAGE_RPC` messages on the WebsocketProvider
- Dispatches to a handler registry keyed by tool name
- Each handler receives `(ydoc: Y.Doc, args: Record<string, unknown>)` and returns a result
- Handlers execute engine functions directly (addShape, updateShape, etc.)
- After mutations, auto-layout is applied automatically
- Responses are sent back over the same WebSocket connection

### Background Tab Safety

All rendering uses `document.createElement('canvas')` (offscreen DOM canvas), not the visible render loop canvas. This works in background/minimized tabs because:

- DOM canvas creation is not throttled
- `canvas.getContext('2d')` works in background tabs
- `canvas.toBlob()` works in background tabs
- Font loading via `document.fonts.load()` works in background tabs
- Only `requestAnimationFrame` is throttled (used by the live viewport, not exports)

## MCP Tool Architecture (API side)

After the refactor, each MCP tool on the API side follows this pattern:

```typescript
defineTool(server, 'tool_name', 'description', schema, async (args) => {
  const userId = getUserId();
  await assertDraftAccess(args.draftId, userId);
  requireBrowser(args.draftId); // throws if no browser connected
  const result = await sendRpc(args.draftId, 'tool_name', args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

For `export_png`, the response uses MCP's image content type:

```typescript
return { content: [{ type: 'image', data: result.base64, mimeType: 'image/png' }] };
```

## Error Handling

- **No browser connected**: MCP tool returns clear error "No editor tab is open for this draft. Open it in your browser first."
- **Browser tab closed during RPC**: 30s timeout, then error
- **Handler throws**: Error message sent back via RPC response, surfaced to AI agent
- **Invalid tool name**: Browser returns error "Unknown RPC tool: xxx"

## File Changes

### New files

- `apps/web/src/pages/editor/hooks/use-rpc.ts` — Browser RPC handler + tool dispatcher
- `apps/web/src/pages/editor/rpc-handlers.ts` — Individual tool handler implementations

### Modified files

- `apps/web/src/pages/editor/index.tsx` — Wire up `useRpc` hook
- `apps/api/src/modules/mcp/tools/*.ts` — All tool files rewritten to forward via RPC
- `apps/api/src/modules/mcp/mcp.auth.ts` — Add `requireBrowser()` helper
