import type { Shape } from '@draftila/shared';

export interface SnapLine {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export interface DistanceIndicator {
  axis: 'x' | 'y';
  from: number;
  to: number;
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  snapLines: SnapLine[];
  distanceIndicators: DistanceIndicator[];
}

const SNAP_THRESHOLD = 5;

interface ShapeEdges {
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
}

function getEdges(x: number, y: number, w: number, h: number): ShapeEdges {
  return {
    left: x,
    centerX: x + w / 2,
    right: x + w,
    top: y,
    centerY: y + h / 2,
    bottom: y + h,
  };
}

function computeSnapLineExtent(
  axis: 'x' | 'y',
  _position: number,
  movingEdges: ShapeEdges,
  otherEdges: ShapeEdges,
): { start: number; end: number } {
  if (axis === 'x') {
    const allY = [movingEdges.top, movingEdges.bottom, otherEdges.top, otherEdges.bottom];
    return { start: Math.min(...allY), end: Math.max(...allY) };
  }
  const allX = [movingEdges.left, movingEdges.right, otherEdges.left, otherEdges.right];
  return { start: Math.min(...allX), end: Math.max(...allX) };
}

function buildDistanceIndicators(
  snappedX: number,
  snappedY: number,
  width: number,
  height: number,
  otherShapes: Shape[],
  snappedOnX: boolean,
  snappedOnY: boolean,
): DistanceIndicator[] {
  const indicators: DistanceIndicator[] = [];
  const movingLeft = snappedX;
  const movingRight = snappedX + width;
  const movingTop = snappedY;
  const movingBottom = snappedY + height;
  const movingCenterY = snappedY + height / 2;
  const movingCenterX = snappedX + width / 2;

  if (snappedOnY) {
    const shapesLeft = otherShapes
      .filter((s) => s.x + s.width <= movingLeft)
      .filter((s) => s.y + s.height > movingTop && s.y < movingBottom);
    const shapesRight = otherShapes
      .filter((s) => s.x >= movingRight)
      .filter((s) => s.y + s.height > movingTop && s.y < movingBottom);

    if (shapesLeft.length > 0) {
      const nearest = shapesLeft.reduce((best, s) =>
        s.x + s.width > best.x + best.width ? s : best,
      );
      const gap = movingLeft - (nearest.x + nearest.width);
      if (gap > 0) {
        indicators.push({
          axis: 'x',
          from: nearest.x + nearest.width,
          to: movingLeft,
          position: movingCenterY,
        });
      }
    }

    if (shapesRight.length > 0) {
      const nearest = shapesRight.reduce((best, s) => (s.x < best.x ? s : best));
      const gap = nearest.x - movingRight;
      if (gap > 0) {
        indicators.push({
          axis: 'x',
          from: movingRight,
          to: nearest.x,
          position: movingCenterY,
        });
      }
    }
  }

  if (snappedOnX) {
    const shapesAbove = otherShapes
      .filter((s) => s.y + s.height <= movingTop)
      .filter((s) => s.x + s.width > movingLeft && s.x < movingRight);
    const shapesBelow = otherShapes
      .filter((s) => s.y >= movingBottom)
      .filter((s) => s.x + s.width > movingLeft && s.x < movingRight);

    if (shapesAbove.length > 0) {
      const nearest = shapesAbove.reduce((best, s) =>
        s.y + s.height > best.y + best.height ? s : best,
      );
      const gap = movingTop - (nearest.y + nearest.height);
      if (gap > 0) {
        indicators.push({
          axis: 'y',
          from: nearest.y + nearest.height,
          to: movingTop,
          position: movingCenterX,
        });
      }
    }

    if (shapesBelow.length > 0) {
      const nearest = shapesBelow.reduce((best, s) => (s.y < best.y ? s : best));
      const gap = nearest.y - movingBottom;
      if (gap > 0) {
        indicators.push({
          axis: 'y',
          from: movingBottom,
          to: nearest.y,
          position: movingCenterX,
        });
      }
    }
  }

  return indicators;
}

export function snapPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  otherShapes: Shape[],
  zoom: number,
): SnapResult {
  const threshold = SNAP_THRESHOLD / zoom;

  let snappedX = x;
  let snappedY = y;
  let bestDx = threshold;
  let bestDy = threshold;

  const movingEdges = getEdges(x, y, width, height);

  interface SnapCandidate {
    position: number;
    otherEdges: ShapeEdges;
  }

  let bestXCandidates: SnapCandidate[] = [];
  let bestYCandidates: SnapCandidate[] = [];

  for (const shape of otherShapes) {
    const edges = getEdges(shape.x, shape.y, shape.width, shape.height);

    for (const myEdge of [movingEdges.left, movingEdges.centerX, movingEdges.right]) {
      for (const otherEdge of [edges.left, edges.centerX, edges.right]) {
        const d = Math.abs(myEdge - otherEdge);
        if (d < bestDx) {
          bestDx = d;
          snappedX = x + (otherEdge - myEdge);
          bestXCandidates = [{ position: otherEdge, otherEdges: edges }];
        } else if (d === bestDx && bestDx < threshold) {
          bestXCandidates.push({ position: otherEdge, otherEdges: edges });
        }
      }
    }

    for (const myEdge of [movingEdges.top, movingEdges.centerY, movingEdges.bottom]) {
      for (const otherEdge of [edges.top, edges.centerY, edges.bottom]) {
        const d = Math.abs(myEdge - otherEdge);
        if (d < bestDy) {
          bestDy = d;
          snappedY = y + (otherEdge - myEdge);
          bestYCandidates = [{ position: otherEdge, otherEdges: edges }];
        } else if (d === bestDy && bestDy < threshold) {
          bestYCandidates.push({ position: otherEdge, otherEdges: edges });
        }
      }
    }
  }

  const snappedMovingEdges = getEdges(snappedX, snappedY, width, height);
  const snapLines: SnapLine[] = [];
  const seenLines = new Set<string>();

  for (const candidate of bestXCandidates) {
    const extent = computeSnapLineExtent(
      'x',
      candidate.position,
      snappedMovingEdges,
      candidate.otherEdges,
    );
    const key = `x:${candidate.position}`;
    if (seenLines.has(key)) {
      const existing = snapLines.find((l) => l.axis === 'x' && l.position === candidate.position);
      if (existing) {
        existing.start = Math.min(existing.start, extent.start);
        existing.end = Math.max(existing.end, extent.end);
      }
    } else {
      seenLines.add(key);
      snapLines.push({ axis: 'x', position: candidate.position, ...extent });
    }
  }

  for (const candidate of bestYCandidates) {
    const extent = computeSnapLineExtent(
      'y',
      candidate.position,
      snappedMovingEdges,
      candidate.otherEdges,
    );
    const key = `y:${candidate.position}`;
    if (seenLines.has(key)) {
      const existing = snapLines.find((l) => l.axis === 'y' && l.position === candidate.position);
      if (existing) {
        existing.start = Math.min(existing.start, extent.start);
        existing.end = Math.max(existing.end, extent.end);
      }
    } else {
      seenLines.add(key);
      snapLines.push({ axis: 'y', position: candidate.position, ...extent });
    }
  }

  const snappedOnX = bestDx < threshold;
  const snappedOnY = bestDy < threshold;

  const distanceIndicators = buildDistanceIndicators(
    snappedX,
    snappedY,
    width,
    height,
    otherShapes,
    snappedOnX,
    snappedOnY,
  );

  return { x: snappedX, y: snappedY, snapLines, distanceIndicators };
}
