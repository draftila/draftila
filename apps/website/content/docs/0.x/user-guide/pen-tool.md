---
title: Pen Tool & Paths
description: Draw and edit vector paths with the pen and pencil tools.
---

# Pen Tool & Paths

Draftila provides two drawing tools for creating vector paths.

## Pen Tool

Press `P` to activate the pen tool. Click on the canvas to place nodes one at a time.

- **Click** to place a corner node (sharp point)
- **Click and drag** to place a smooth node with Bezier curve handles
- **Click on the first node** to close the path
- **Double-click** or press `Enter` to finish an open path

### Node Types

| Type      | Behavior                                               |
| --------- | ------------------------------------------------------ |
| Corner    | Sharp point, no curve handles                          |
| Smooth    | Curve handles are aligned (opposite directions)        |
| Symmetric | Curve handles are mirrored (same length and direction) |

## Pencil Tool

Press `Shift` + `P` to activate the pencil tool. Click and drag to draw freehand paths. The path is automatically simplified into clean curves when you release.

You can also hold `Alt` while using any tool to temporarily switch to freehand drawing.

## Node Editing

Select a path and press `Enter` (or `N`) to enter node editing mode.

- **Drag nodes** to reposition them
- **Drag handles** to adjust curves
- **Delete** or **Backspace** to remove the selected node
- **Escape** to exit node editing

### Path Properties

| Property     | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| Vector nodes | Array of nodes with positions and curve handles               |
| Fill rule    | Nonzero or Evenodd (affects how overlapping areas are filled) |
| Fills        | Same fill options as other shapes                             |
| Strokes      | Same stroke options as other shapes                           |

## Boolean Operations

Select two or more overlapping shapes and apply a boolean operation to combine them:

| Operation | Result                                                           |
| --------- | ---------------------------------------------------------------- |
| Union     | Combines all shapes into one                                     |
| Subtract  | Removes the overlapping area of top shapes from the bottom shape |
| Intersect | Keeps only the overlapping area                                  |
| Exclude   | Keeps only the non-overlapping areas                             |

The result is a new path shape. The original shapes are removed.
