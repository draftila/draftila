---
title: MCP Integration
description: Connect AI agents to Draftila using the Model Context Protocol.
---

# MCP Integration

Draftila implements a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, allowing AI agents like Claude to design directly in your Draftila editor.

## How It Works

1. The AI agent sends tool calls to the Draftila API via MCP
2. The API executes each operation on the server against the draft's live collaborative document, including text measurement, auto-layout, and rendering
3. Document changes are broadcast over WebSocket to every connected editor
4. Results are returned to the AI agent

All operations happen in real-time — if you have the draft open, you can watch the AI design in your editor as it works. No open browser tab is required for the operations to run.

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

### Choosing a Draft

The AI agent picks a draft with `list_drafts` and passes its id to every tool. Keeping the draft open in your browser lets you watch the changes live, but it is not required.

## Available Tools

The MCP server exposes around 50 tools organized into categories. It also sends the client a set of usage instructions on connect — the workflow to follow, how globals and auto-layout are meant to be used, and the gotchas worth knowing — so a capable agent does not need this page to work effectively.

### Draft Management

| Tool                  | Description                                 |
| --------------------- | ------------------------------------------- |
| `list_drafts`         | List all accessible drafts                  |
| `list_pages`          | List pages in the current draft             |
| `add_page`            | Create a new page                           |
| `remove_page`         | Delete a page                               |
| `rename_page`         | Rename a page                               |
| `set_active_page`     | Switch the active page                      |
| `set_page_background` | Set a page's background color (null resets) |

### Shape Creation

| Tool                  | Description                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `create_shape`        | Create a single shape (best for incremental edits)                                       |
| `batch_create_shapes` | Create a whole shape tree in one call via nested `children` (max 100 entries, 200 nodes) |
| `get_shape`           | Get a shape's properties                                                                 |
| `update_shape`        | Modify shape properties                                                                  |
| `batch_update_shapes` | Update multiple shapes at once, with per-item results                                    |
| `delete_shapes`       | Delete shapes                                                                            |
| `list_shapes`         | List all shapes or children of a shape (compact mode includes text and fill summaries)   |
| `find_shapes`         | Search shapes by name, type, or text content, with pagination                            |
| `duplicate_shapes`    | Duplicate shapes                                                                         |

`batch_create_shapes` creates the whole batch in a single document transaction with one layout pass. Hierarchy is expressed with nested `children` arrays — children are parented automatically and positioned relative to their parent — and the flat `"$0"`/`"$1"` parent-reference form is still accepted for backwards compatibility. Create and update tools also return a `warnings` array when props contain unknown keys, so typos surface instead of persisting silently.

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

| Tool                         | Description                                                         |
| ---------------------------- | ------------------------------------------------------------------- |
| `export_svg`                 | Export as SVG markup                                                |
| `export_png`                 | Export as base64 PNG (scale, background, region capture, auto-crop) |
| `export_html`                | Export as a standalone HTML document (Tailwind or embedded CSS)     |
| `export_css`                 | Export as CSS code (dimensions, fills, borders, flexbox)            |
| `export_css_all_layers`      | Export as CSS with rules for all descendant layers                  |
| `export_tailwind`            | Export as Tailwind utility classes                                  |
| `export_tailwind_all_layers` | Export Tailwind classes for all descendant layers                   |
| `export_swiftui`             | Export as SwiftUI code (HStack/VStack, modifiers)                   |
| `export_compose`             | Export as Jetpack Compose code (Row/Column, Modifiers)              |
| `import_svg`                 | Parse SVG and create shapes                                         |
| `import_html`                | Convert Tailwind-styled HTML into a native shape tree in one call   |
| `list_icons`                 | List available Lucide icons                                         |
| `insert_icon`                | Insert a Lucide icon as SVG                                         |
| `list_fonts`                 | List custom font families uploaded by an admin                      |

#### Importing HTML with Tailwind classes

`import_html` is the fastest way for an agent to build a whole screen or section: it takes HTML markup styled with Tailwind utility classes and converts it into native Draftila shapes in a single call.

- Flex containers (`flex`, `flex-col`, `gap-*`, `p-*`, `items-*`, `justify-*`) become auto-layout frames
- Headings, paragraphs, and labels become text shapes; inline `<strong>`/`<em>`/styled `<span>` runs become rich-text segments
- `<img>` becomes an image shape (the `src` is downloaded, validated, and stored with the draft, like other MCP image imports); inline `<svg>` becomes an SVG shape
- Sizing follows CSS semantics: `w-*`/`h-*` fix a dimension, `w-full`/`flex-1`/`grow` fill, everything else hugs its content
- Supported styling includes the default Tailwind color palette, arbitrary values (`bg-[#hex]`, `w-[313px]`, `text-[15px]`), gradients (`bg-linear-to-*` with `from-`/`via-`/`to-`), borders, `rounded-*`, `shadow-*`, opacity, blur, and a small inline `style=""` fallback

Unsupported constructs are approximated and reported in the returned `warnings` array rather than failing the import: CSS grid becomes a vertical stack, responsive prefixes (`sm:`/`md:`/`lg:`) are ignored in favor of the base classes, state prefixes (`hover:`/`dark:`) are dropped, margins are ignored (use gap and padding), and tables and form controls become placeholders.

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

| Tool              | Description                                         |
| ----------------- | --------------------------------------------------- |
| `list_guides`     | List ruler guides                                   |
| `add_guide`       | Add a guide line                                    |
| `remove_guide`    | Remove a guide                                      |
| `list_variables`  | List the draft's globals, with usage counts         |
| `set_variable`    | Create or update a global                           |
| `delete_variable` | Delete a global (bound shapes keep their colour)    |
| `bind_variable`   | Bind an existing shape's fill or stroke to a global |
| `unbind_variable` | Remove a binding, keeping the colour it shows       |

Globals are the draft's named colour tokens ("Globals" in the editor). Bind a fill or stroke by setting `colorVar` to the global's **id** while creating the shape, keeping `color` set as the fallback; use `bind_variable` / `unbind_variable` to change a binding on a shape that already exists. Updating a global repaints every shape bound to it across the draft.

## Limitations

- The MCP endpoint is rate limited to 60 requests per minute per client — the bulk tools (`import_html`, `batch_create_shapes`) exist so agents rarely need more
- `batch_create_shapes` accepts up to 100 top-level entries and 200 shapes in total per call; `batch_update_shapes` accepts up to 100 updates
- `export_png` output is capped at 4096×4096 pixels; larger requests are downscaled automatically
- The AI sees the same design state as your editor — changes are synced in real-time
