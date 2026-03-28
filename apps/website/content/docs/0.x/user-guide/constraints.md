---
title: Constraints
description: Pin elements to edges for responsive behavior when resizing parent frames.
---

# Constraints

Constraints control how a shape repositions and resizes when its parent frame is resized. They apply to shapes inside frames that do **not** have auto-layout enabled.

:::tip
If a frame has auto-layout enabled, child sizing is controlled by the layout properties (fixed, hug, fill) instead of constraints.
:::

## Horizontal Constraints

| Constraint   | Behavior                                                  |
| ------------ | --------------------------------------------------------- |
| Left         | Shape stays a fixed distance from the parent's left edge  |
| Right        | Shape stays a fixed distance from the parent's right edge |
| Left & Right | Shape stretches to maintain distance from both edges      |
| Center       | Shape stays centered horizontally in the parent           |
| Scale        | Shape scales proportionally with the parent's width       |

## Vertical Constraints

| Constraint   | Behavior                                                   |
| ------------ | ---------------------------------------------------------- |
| Top          | Shape stays a fixed distance from the parent's top edge    |
| Bottom       | Shape stays a fixed distance from the parent's bottom edge |
| Top & Bottom | Shape stretches to maintain distance from both edges       |
| Center       | Shape stays centered vertically in the parent              |
| Scale        | Shape scales proportionally with the parent's height       |

## Example

A "Submit" button pinned to **Right** and **Bottom** will stay in the bottom-right corner of its parent frame, regardless of how the frame is resized.

A header bar with **Left & Right** horizontal constraint will stretch to match the full width of its parent frame.
