---
title: Editor Basics
description: Learn the fundamentals of the Draftila design editor.
---

# Editor Basics

The Draftila editor is where you create and edit your designs. It consists of a canvas, toolbar, left panel (layers and pages), and right panel (properties).

## Canvas Navigation

### Panning

- **Hand tool** — Press `H` to activate, then click and drag to pan
- **Space + drag** — Hold Space while using any tool to temporarily pan
- **Middle-click drag** — Pan with the middle mouse button

### Zooming

| Action            | Shortcut         |
| ----------------- | ---------------- |
| Zoom in           | `Cmd/Ctrl` + `+` |
| Zoom out          | `Cmd/Ctrl` + `-` |
| Fit all shapes    | `Shift` + `1`    |
| Zoom to selection | `Shift` + `2`    |

You can also zoom with the scroll wheel while holding `Cmd/Ctrl`.

## Toolbar

The toolbar at the top provides access to all creation and editing tools:

| Tool      | Shortcut      | Description                             |
| --------- | ------------- | --------------------------------------- |
| Move      | `V`           | Select, move, resize, and rotate shapes |
| Hand      | `H`           | Pan the canvas                          |
| Comment   | `C`           | Create comments on the canvas           |
| Frame     | `F`           | Create frame containers                 |
| Rectangle | `R`           | Draw rectangles                         |
| Ellipse   | `O`           | Draw circles and ellipses               |
| Polygon   | `Y`           | Draw polygons (configurable sides)      |
| Star      | `S`           | Draw stars (configurable points)        |
| Line      | `L`           | Draw lines with optional arrowheads     |
| Arrow     | `A`           | Draw arrows                             |
| Text      | `T`           | Create text elements                    |
| Pen       | `P`           | Draw precise vector paths               |
| Pencil    | `Shift` + `P` | Freehand drawing                        |

Shape tools (Rectangle, Ellipse, Polygon, Star, Line, Arrow) are grouped in a dropdown. Pen and Pencil share another dropdown.

## Selecting Shapes

- **Click** a shape to select it
- **Shift + click** to add/remove shapes from selection
- **Cmd/Ctrl + A** to select all shapes on the page
- **Drag** on empty canvas to create a selection box
- **Tab** / **Shift + Tab** to cycle through sibling shapes
- **Escape** to deselect all or exit group editing

## Moving and Resizing

- **Drag** a selected shape to move it
- **Arrow keys** nudge by 1px, **Shift + Arrow** nudges by 10px
- **Drag handles** on the selection box to resize
- **Hold Shift** while resizing to maintain aspect ratio
- **Hold Cmd/Ctrl** while drawing to constrain to squares or snap to 45/90 degree angles

## Rotating

Hover just outside a corner handle of a selected shape to reveal the rotation cursor. Drag to rotate.

## Flipping

| Action          | Shortcut      |
| --------------- | ------------- |
| Flip horizontal | `Shift` + `H` |
| Flip vertical   | `Shift` + `V` |

## Stacking Order (Z-Order)

| Action         | Shortcut                 |
| -------------- | ------------------------ |
| Move forward   | `Cmd/Ctrl` + `]`         |
| Move backward  | `Cmd/Ctrl` + `[`         |
| Bring to front | `Cmd/Ctrl` + `Alt` + `]` |
| Send to back   | `Cmd/Ctrl` + `Alt` + `[` |

## Grouping

| Action         | Shortcut                   |
| -------------- | -------------------------- |
| Group shapes   | `Cmd/Ctrl` + `G`           |
| Ungroup shapes | `Cmd/Ctrl` + `Shift` + `G` |
| Wrap in frame  | `Cmd/Ctrl` + `Alt` + `G`   |

## Copy, Paste, and Duplicate

| Action         | Shortcut                   |
| -------------- | -------------------------- |
| Copy           | `Cmd/Ctrl` + `C`           |
| Cut            | `Cmd/Ctrl` + `X`           |
| Paste          | `Cmd/Ctrl` + `V`           |
| Paste in place | `Cmd/Ctrl` + `Shift` + `V` |
| Duplicate      | `Cmd/Ctrl` + `D`           |
| Copy style     | `Cmd/Ctrl` + `Alt` + `C`   |
| Paste style    | `Cmd/Ctrl` + `Alt` + `V`   |
| Delete         | `Delete` / `Backspace`     |

## Undo and Redo

| Action | Shortcut                   |
| ------ | -------------------------- |
| Undo   | `Cmd/Ctrl` + `Z`           |
| Redo   | `Cmd/Ctrl` + `Shift` + `Z` |

Full history is maintained throughout your session and works with all operations.

## Rulers and Guides

Toggle rulers with `Shift` + `R`. Guides help you align shapes precisely on the canvas.

Smart alignment guides appear automatically when moving or resizing shapes near other shapes.
