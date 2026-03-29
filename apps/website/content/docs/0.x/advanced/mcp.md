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

The MCP server exposes 30+ tools organized into categories.

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

### Export, Import, and Code Generation

| Tool                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `export_svg`            | Export as SVG markup                                     |
| `export_png`            | Export as base64 PNG (configurable scale and background) |
| `export_css`            | Export as CSS code (dimensions, fills, borders, flexbox) |
| `export_css_all_layers` | Export as CSS with rules for all descendant layers       |
| `export_swiftui`        | Export as SwiftUI code (HStack/VStack, modifiers)        |
| `export_compose`        | Export as Jetpack Compose code (Row/Column, Modifiers)   |
| `import_svg`            | Parse SVG and create shapes                              |
| `list_icons`            | List available Lucide icons                              |
| `insert_icon`           | Insert a Lucide icon as SVG                              |

### Guides and Variables

| Tool              | Description                    |
| ----------------- | ------------------------------ |
| `list_guides`     | List ruler guides              |
| `add_guide`       | Add a guide line               |
| `remove_guide`    | Remove a guide                 |
| `list_variables`  | List color tokens              |
| `set_variable`    | Create or update a color token |
| `delete_variable` | Delete a color token           |

## Limitations

- Each MCP operation has a 30-second timeout
- The draft must be open in a browser tab for operations to execute
- Batch operations are limited to 50 shapes per call
- The AI sees the same design state as your editor — changes are synced in real-time
