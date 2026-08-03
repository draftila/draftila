---
title: MCP Integration
description: Connect AI agents to Draftila using the Model Context Protocol.
---

# MCP Integration

Draftila implements a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, allowing AI agents like Claude to design directly in your Draftila editor.

## How It Works

1. The AI agent sends tool calls to the Draftila API via MCP
2. The API proxies these operations to the browser editor via WebSocket
3. The browser executes the operations on the canvas (for accurate text measurement, layout, and rendering)
4. Results are streamed back to the AI agent

All operations happen in real-time — you can watch the AI design in your editor as it works.

## Setup

### Prerequisites

- A running Draftila instance
- An API key (see [API Keys](/docs/advanced/api-keys))
- An MCP-compatible client (e.g., Claude Desktop, Claude Code)

### Configuration

Add Draftila as an MCP server in your client's configuration. For Claude Desktop, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "draftila": {
      "url": "https://your-draftila-instance.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

:::tip
Replace the URL with your actual Draftila instance URL and use a real API key.
:::

### Opening a Draft

You must have a draft open in the Draftila editor in your browser for MCP operations to work. The AI agent operates on whichever draft is currently active.

## Available Tools

The MCP server exposes around 50 tools organized into categories. It also sends the client a set of usage instructions on connect — the workflow to follow, how globals and auto-layout are meant to be used, and the gotchas worth knowing — so a capable agent does not need this page to work effectively.

### Draft Management

| Tool              | Description                     |
| ----------------- | ------------------------------- |
| `list_drafts`     | List all accessible drafts      |
| `list_pages`      | List pages in the current draft |
| `add_page`        | Create a new page               |
| `remove_page`     | Delete a page                   |
| `rename_page`     | Rename a page                   |
| `set_active_page` | Switch the active page          |

### Shape Creation

| Tool                  | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `create_shape`        | Create a single shape (recommended for live feedback) |
| `batch_create_shapes` | Create multiple shapes at once (max 50)               |
| `get_shape`           | Get a shape's properties                              |
| `update_shape`        | Modify shape properties                               |
| `batch_update_shapes` | Update multiple shapes at once                        |
| `delete_shapes`       | Delete shapes                                         |
| `list_shapes`         | List all shapes or children of a shape                |
| `duplicate_shapes`    | Duplicate shapes                                      |

#### Images created through MCP

For image shapes, pass an HTTP(S) URL in `src`. For an image fill, pass an HTTP(S) URL or data URI in `imageSrc`. This works with `create_shape`, `update_shape`, and their batch variants.

Draftila downloads and validates the image on the server, stores it with the draft, and writes an app-owned `/storage/...` URL into the document. The editor therefore does not request the original host and is not affected by that host's browser CORS policy. Reusing the same image within one tool call imports it only once.

Remote imports use the same 20 MB file limit, 30 megapixel decode limit, 10 second timeout, redirect limit, and private-network protections described below. If an import fails validation, the shape operation fails without writing the external URL to the document.

### Grouping and Layout

| Tool                | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `group_shapes`      | Group shapes together                                   |
| `ungroup_shapes`    | Ungroup a group                                         |
| `frame_selection`   | Wrap shapes in a frame                                  |
| `apply_auto_layout` | Apply auto-layout to a frame                            |
| `align_shapes`      | Align shapes (left, center, right, top, middle, bottom) |
| `distribute_shapes` | Distribute shapes evenly (3+ shapes)                    |
| `nudge_shapes`      | Move shapes by an offset                                |
| `flip_shapes`       | Flip horizontally or vertically                         |
| `move_in_stack`     | Change z-order (forward, backward, to front, to back)   |
| `move_by_drop`      | Reparent a shape into another container                 |

### Vector and Boolean

| Tool                | Description                                   |
| ------------------- | --------------------------------------------- |
| `boolean_operation` | Union, subtract, intersect, or exclude shapes |

### Components

| Tool               | Description                 |
| ------------------ | --------------------------- |
| `create_component` | Define a reusable component |
| `create_instance`  | Create a component instance |
| `list_components`  | List all components         |
| `remove_component` | Delete a component          |

Components are snapshots, not live definitions. `create_component` captures the shapes you pass along with their descendants, and `create_instance` stamps out an independent copy with fresh shape IDs: editing an instance does not change the component, editing the component does not change existing instances, and there is no update, override, or detach. This matches the editor UI, which offers the same create, insert, rename, and delete actions and no way to push changes to existing instances. `remove_component` deletes the definition only; shapes already stamped out remain on the canvas.

### Export, Import, and Code Generation

| Tool                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `export_svg`            | Export as SVG markup                                     |
| `export_png`            | Export as base64 PNG (configurable scale and background) |
| `export_css`            | Export as CSS code (dimensions, fills, borders, flexbox) |
| `export_css_all_layers` | Export as CSS with rules for all descendant layers       |
| `export_tailwind`       | Export as Tailwind utility classes                       |
| `export_tailwind_all_layers` | Export Tailwind classes for all descendant layers   |
| `export_swiftui`        | Export as SwiftUI code (HStack/VStack, modifiers)        |
| `export_compose`        | Export as Jetpack Compose code (Row/Column, Modifiers)   |
| `import_svg`            | Parse SVG and create shapes                              |
| `list_icons`            | List available Lucide icons                              |
| `insert_icon`           | Insert a Lucide icon as SVG                              |
| `list_fonts`            | List custom font families uploaded by an admin           |

#### Images in PNG exports

`export_png` renders on the server, so every image it needs is fetched before drawing:

- Data URIs (including icons and imported SVG) are decoded locally
- `http(s)` URLs are downloaded, following up to 3 redirects, with a 10 second timeout and a 20 MB limit per image
- The host is resolved once and the connection is pinned to that address, so a hostname cannot resolve to a public address during the check and a private one during the request
- Requests to loopback, link-local, and private network addresses are rejected, so images hosted on an internal network will not render
- Images that decode to more than 30 megapixels are rejected, as are formats whose dimensions cannot be read, so a small file cannot expand into a very large bitmap
- A single export loads at most 200 distinct images and spends at most 30 seconds loading them; anything beyond that is left unloaded
- An image that cannot be loaded degrades gracefully: image layers show a grey placeholder and image fills are skipped, the rest of the export still renders

### Guides and Globals

| Tool               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `list_guides`      | List ruler guides                                    |
| `add_guide`        | Add a guide line                                     |
| `remove_guide`     | Remove a guide                                       |
| `list_variables`   | List the draft's globals, with usage counts          |
| `set_variable`     | Create or update a global                            |
| `delete_variable`  | Delete a global (bound shapes keep their colour)     |
| `bind_variable`    | Bind an existing shape's fill or stroke to a global  |
| `unbind_variable`  | Remove a binding, keeping the colour it shows        |

Globals are the draft's named colour tokens ("Globals" in the editor). Bind a fill or stroke by setting `colorVar` to the global's **id** while creating the shape, keeping `color` set as the fallback; use `bind_variable` / `unbind_variable` to change a binding on a shape that already exists. Updating a global repaints every shape bound to it across the draft.

## Limitations

- Each MCP operation has a 30-second timeout
- The draft must be open in a browser tab for operations to execute
- Batch operations are limited to 50 shapes per call
- The AI sees the same design state as your editor — changes are synced in real-time
