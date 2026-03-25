import type { Shape } from '@draftila/shared';
import { getSelectionBounds } from './selection-bounds';

export function alignShapes(
  shapes: Shape[],
  alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom',
): Map<string, { x: number; y: number }> {
  const bounds = getSelectionBounds(shapes);
  if (!bounds) return new Map();

  const updates = new Map<string, { x: number; y: number }>();

  for (const shape of shapes) {
    let x = shape.x;
    let y = shape.y;

    switch (alignment) {
      case 'left':
        x = bounds.x;
        break;
      case 'center-h':
        x = bounds.x + bounds.width / 2 - shape.width / 2;
        break;
      case 'right':
        x = bounds.x + bounds.width - shape.width;
        break;
      case 'top':
        y = bounds.y;
        break;
      case 'center-v':
        y = bounds.y + bounds.height / 2 - shape.height / 2;
        break;
      case 'bottom':
        y = bounds.y + bounds.height - shape.height;
        break;
    }

    updates.set(shape.id, { x, y });
  }

  return updates;
}

export function distributeShapes(
  shapes: Shape[],
  direction: 'horizontal' | 'vertical',
): Map<string, { x: number; y: number }> {
  if (shapes.length < 3) return new Map();

  const sorted = [...shapes].sort((a, b) => (direction === 'horizontal' ? a.x - b.x : a.y - b.y));

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const totalSpace =
    direction === 'horizontal' ? last.x + last.width - first.x : last.y + last.height - first.y;

  const totalShapeSize = sorted.reduce(
    (sum, s) => sum + (direction === 'horizontal' ? s.width : s.height),
    0,
  );

  const gap = (totalSpace - totalShapeSize) / (sorted.length - 1);
  const updates = new Map<string, { x: number; y: number }>();

  let pos = direction === 'horizontal' ? first.x : first.y;

  for (const shape of sorted) {
    if (direction === 'horizontal') {
      updates.set(shape.id, { x: pos, y: shape.y });
      pos += shape.width + gap;
    } else {
      updates.set(shape.id, { x: shape.x, y: pos });
      pos += shape.height + gap;
    }
  }

  return updates;
}
