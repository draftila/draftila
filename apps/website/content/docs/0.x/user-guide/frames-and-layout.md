---
title: Frames & Auto-Layout
description: Use frames and auto-layout to build structured, responsive designs.
---

# Frames & Auto-Layout

Frames are the primary container in Draftila. They group child shapes and can apply auto-layout for structured, responsive designs.

## Creating Frames

- Press `F` and drag to create an empty frame
- Select shapes and press `Cmd/Ctrl` + `Alt` + `G` to wrap them in a frame
- Frames have a default white fill and 1280x720 size

## Frame Properties

| Property      | Description                                                |
| ------------- | ---------------------------------------------------------- |
| Clip content  | When enabled, children outside the frame bounds are hidden |
| Corner radius | Uniform or per-corner, with optional corner smoothing      |
| Layout guides | Add grid, column, or row guides for visual alignment       |

## Auto-Layout

Auto-layout turns a frame into a flex-like container that automatically arranges its children.

### Enabling Auto-Layout

Set the layout mode to **Horizontal** or **Vertical** in the properties panel.

- **Horizontal** — Children flow left to right
- **Vertical** — Children flow top to bottom

### Spacing and Padding

| Property   | Description                                     |
| ---------- | ----------------------------------------------- |
| Gap        | Spacing between children on the main axis       |
| Column gap | Spacing between rows when wrapping is enabled   |
| Padding    | Top, Right, Bottom, Left inset inside the frame |

### Alignment

**Main axis** (justify):

- Start — Pack children to the beginning
- Center — Center children
- End — Pack children to the end
- Space Between — Distribute space evenly between children
- Space Around — Distribute space evenly around children

**Cross axis** (align):

- Start — Align to the start
- Center — Center on the cross axis
- End — Align to the end
- Stretch — Stretch children to fill the cross axis

### Wrapping

Enable **Wrap** to let children flow onto the next line when they exceed the frame width (horizontal layout) or height (vertical layout). Use column gap to control spacing between rows.

### Child Sizing

Children in an auto-layout frame can control how they size:

- **Fixed** — Uses the specified width/height
- **Hug** — Shrinks to fit the child's own content
- **Fill** — Expands to fill remaining space in the parent

You can also set min/max width and height constraints on children to limit how much they can grow or shrink.

### Frame Sizing

The frame itself can also be set to:

- **Fixed** — Maintains a set size
- **Hug** — Shrinks to tightly fit all children

## Layout Guides

Frames can display non-printing guide overlays:

- **Grid** — Even grid overlay
- **Columns** — Vertical column guides
- **Rows** — Horizontal row guides

Each guide type has configurable size, color, and visibility.
