---
title: Images & Export
description: Import images and export your designs in multiple formats.
---

# Images & Export

## Importing Images

### From Your Computer

Drag and drop image files directly onto the canvas. Supported formats: JPEG, PNG, GIF, WebP.

### From Clipboard

Copy an image from any application and paste it into Draftila with `Cmd/Ctrl` + `V`.

### Image Properties

| Property    | Description                                                                             |
| ----------- | --------------------------------------------------------------------------------------- |
| Source      | URL or uploaded file path                                                               |
| Fit         | **Fill** (stretch to cover), **Fit** (contain within bounds), **Crop** (clip to bounds) |
| Crop center | Adjust the focal point when using crop mode (X, Y from 0 to 1)                          |

Images support all the same properties as other shapes — fills, strokes, shadows, blur, opacity, blend modes, and constraints.

## Exporting Designs

Draftila can export your designs in two formats.

### SVG

Export vector graphics as SVG markup. Ideal for icons, logos, and illustrations that need to scale without quality loss.

### PNG

Export raster images with configurable options:

| Option           | Description                                        |
| ---------------- | -------------------------------------------------- |
| Scale            | Multiplier for resolution (e.g., 2x for retina)    |
| Background color | Set a custom background color or leave transparent |

### What Gets Exported

- **With selection** — Only the selected shapes are exported
- **Without selection** — All shapes on the current page are exported

Exports respect all visual properties including fills, strokes, shadows, blur, clipping, and blend modes.

## Figma Clipboard

You can paste elements copied from Figma directly into Draftila. The pasted content arrives as SVG and is converted to editable Draftila shapes.

Use `Cmd/Ctrl` + `V` to paste or `Cmd/Ctrl` + `Shift` + `V` to paste in place.
