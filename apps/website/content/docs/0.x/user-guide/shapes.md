---
title: Shapes & Drawing
description: Create and customize vector shapes, lines, and paths in Draftila.
---

# Shapes & Drawing

Draftila supports a variety of shape types. Each can be customized with fills, strokes, effects, and more.

## Shape Types

### Rectangle

Press `R` and drag on the canvas. Rectangles support corner radius — uniform or per-corner (top-left, top-right, bottom-left, bottom-right) — plus corner smoothing for iOS-style rounded corners.

### Ellipse

Press `O` and drag. Hold `Cmd/Ctrl` while drawing to constrain to a perfect circle.

### Polygon

Press `Y` and drag. The default is 6 sides. Change the number of sides in the properties panel (minimum 3).

### Star

Press `S` and drag. The default is 5 points. Customize the number of points and the inner radius ratio (0–1) to control how sharp the points are.

### Line

Press `L` and drag. Lines have two endpoints and support arrowheads on either end. Available arrowhead styles:

- None
- Line arrow
- Triangle arrow
- Reversed triangle
- Circle
- Diamond

### Arrow

Press `A` and drag. Same as a line but with a default end arrowhead.

## Fill Properties

Each shape can have multiple stacked fills, each independently togglable:

- **Solid** — A single color with opacity
- **Linear gradient** — Define an angle and color stops
- **Radial gradient** — Define a center, radius, and color stops
- **Image fill** — Use a URL or uploaded image with fit options: fill, fit, crop, or tile

## Stroke Properties

Strokes are also stackable. Each stroke has:

| Property       | Options                                          |
| -------------- | ------------------------------------------------ |
| Color          | Any hex color + opacity                          |
| Width          | Pixels                                           |
| Cap            | Butt, Round, Square                              |
| Join           | Miter, Round, Bevel                              |
| Align          | Center, Inside, Outside                          |
| Dash pattern   | Solid, Dash, Dot, Dash-Dot                       |
| Side selection | Top, Right, Bottom, Left (for rectangles/frames) |

## Effects

### Shadows

Add drop shadows or inner shadows to any shape:

- Color and opacity
- X/Y offset
- Blur radius
- Spread radius

### Blur

Two blur types:

- **Layer blur** — Gaussian blur applied to the shape itself
- **Background blur** — Frosted glass effect, blurs content behind the shape

Both are controlled by a blur radius value.

## Common Properties

All shapes share these properties:

| Property        | Description                                        |
| --------------- | -------------------------------------------------- |
| Position (X, Y) | Coordinates relative to parent                     |
| Width, Height   | Dimensions in pixels                               |
| Rotation        | Degrees of rotation                                |
| Opacity         | 0–100% transparency                                |
| Blend mode      | 17 modes (Normal, Multiply, Screen, Overlay, etc.) |
| Visibility      | Show or hide the shape                             |
| Lock            | Prevent selection and editing                      |
| Name            | Custom label shown in the layers panel             |

## Blend Modes

Available blend modes: Normal, Pass Through, Darken, Multiply, Color Burn, Lighten, Screen, Color Dodge, Overlay, Soft Light, Hard Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity.
