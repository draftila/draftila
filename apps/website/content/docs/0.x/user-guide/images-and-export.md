---
title: Images & Export
description: Import images, export your designs in multiple formats, and copy as code.
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

Draftila can export your designs in multiple formats.

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

## Copy as Code

Right-click on selected shapes and navigate to **Copy/Paste as > Copy as code** to copy your design as platform-native code.

### Supported Formats

| Format            | Description                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| CSS               | CSS properties for the selected shape — dimensions, fills, borders, shadows, blur, flexbox    |
| CSS (all layers)  | CSS for the shape and all its descendants, each as a separate rule block with class selectors |
| iOS (SwiftUI)     | SwiftUI views with HStack/VStack, shape modifiers, Text views, and gradient fills             |
| Android (Compose) | Jetpack Compose code with Row/Column/Box, Modifier chains, and Text composables               |

### What Gets Generated

Code generation maps design properties to their platform equivalents:

- **Fills** — solid colors, linear gradients, radial gradients
- **Strokes** — borders with width, color, dash style, and per-side control
- **Shadows** — drop shadows and inner shadows
- **Blur** — layer blur and background blur (backdrop-filter / frosted glass)
- **Border radius** — uniform or per-corner radii
- **Auto-layout** — flexbox (CSS), HStack/VStack (SwiftUI), Row/Column (Compose)
- **Text** — font family, size, weight, style, line height, letter spacing, alignment, decoration
- **Opacity and blend modes**
- **Rotation** — transforms
- **Vector shapes** — clip-path (CSS), Path views (SwiftUI/Compose)

:::tip
The generated code is a reference starting point, not production-ready output. It captures visual properties accurately but may need adjustments for your specific layout context.
:::

## Figma Clipboard

You can paste elements copied from Figma directly into Draftila. The pasted content arrives as SVG and is converted to editable Draftila shapes.

Use `Cmd/Ctrl` + `V` to paste or `Cmd/Ctrl` + `Shift` + `V` to paste in place.
