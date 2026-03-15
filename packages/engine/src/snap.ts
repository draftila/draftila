import type { Shape } from '@draftila/shared';

export interface SnapLine {
  axis: 'x' | 'y';
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  snapLines: SnapLine[];
}

const SNAP_THRESHOLD = 5;

export function snapPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  otherShapes: Shape[],
  zoom: number,
): SnapResult {
  const threshold = SNAP_THRESHOLD / zoom;
  const snapLines: SnapLine[] = [];

  let snappedX = x;
  let snappedY = y;

  const movingEdges = {
    left: x,
    centerX: x + width / 2,
    right: x + width,
    top: y,
    centerY: y + height / 2,
    bottom: y + height,
  };

  let bestDx = threshold;
  let bestDy = threshold;

  for (const shape of otherShapes) {
    const edges = {
      left: shape.x,
      centerX: shape.x + shape.width / 2,
      right: shape.x + shape.width,
      top: shape.y,
      centerY: shape.y + shape.height / 2,
      bottom: shape.y + shape.height,
    };

    for (const myEdge of [movingEdges.left, movingEdges.centerX, movingEdges.right]) {
      for (const otherEdge of [edges.left, edges.centerX, edges.right]) {
        const d = Math.abs(myEdge - otherEdge);
        if (d < bestDx) {
          bestDx = d;
          snappedX = x + (otherEdge - myEdge);
          snapLines.push({ axis: 'x', position: otherEdge });
        }
      }
    }

    for (const myEdge of [movingEdges.top, movingEdges.centerY, movingEdges.bottom]) {
      for (const otherEdge of [edges.top, edges.centerY, edges.bottom]) {
        const d = Math.abs(myEdge - otherEdge);
        if (d < bestDy) {
          bestDy = d;
          snappedY = y + (otherEdge - myEdge);
          snapLines.push({ axis: 'y', position: otherEdge });
        }
      }
    }
  }

  const filteredLines = snapLines.filter((line) => {
    if (line.axis === 'x') {
      return (
        Math.abs(line.position - snappedX) < threshold ||
        Math.abs(line.position - (snappedX + width / 2)) < threshold ||
        Math.abs(line.position - (snappedX + width)) < threshold
      );
    }
    return (
      Math.abs(line.position - snappedY) < threshold ||
      Math.abs(line.position - (snappedY + height / 2)) < threshold ||
      Math.abs(line.position - (snappedY + height)) < threshold
    );
  });

  return { x: snappedX, y: snappedY, snapLines: filteredLines };
}
