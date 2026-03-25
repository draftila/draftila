import type { Shape } from '@draftila/shared';
import {
  type ShapeEdges,
  type SnapLine,
  type DistanceIndicator,
  type SnapResult,
  type ParentFrameRect,
  type GuideSnapTarget,
  SNAP_THRESHOLD,
  getEdges,
  computeSnapLineExtent,
} from './snap-types';

interface EqualSpacingSnap {
  delta: number;
  indicator: DistanceIndicator;
}

function overlapsOnY(a: { y: number; height: number }, b: { y: number; height: number }): boolean {
  return a.y + a.height > b.y && a.y < b.y + b.height;
}

function overlapsOnX(a: { x: number; width: number }, b: { x: number; width: number }): boolean {
  return a.x + a.width > b.x && a.x < b.x + b.width;
}

function findEqualSpacingSnapX(
  x: number,
  y: number,
  width: number,
  height: number,
  otherShapes: Shape[],
  threshold: number,
): EqualSpacingSnap | null {
  let best: EqualSpacingSnap | null = null;
  const movingCenterY = y + height / 2;

  for (const leftRef of otherShapes) {
    for (const rightRef of otherShapes) {
      if (leftRef.id === rightRef.id) continue;
      if (!overlapsOnY(leftRef, rightRef)) continue;

      const referenceGap = rightRef.x - (leftRef.x + leftRef.width);
      if (referenceGap <= 0) continue;

      for (const anchor of otherShapes) {
        if (!overlapsOnY(anchor, { y, height })) continue;

        const candidateRight = anchor.x + anchor.width + referenceGap;
        const deltaRight = candidateRight - x;
        if (Math.abs(deltaRight) < threshold) {
          if (!best || Math.abs(deltaRight) < Math.abs(best.delta)) {
            best = {
              delta: deltaRight,
              indicator: {
                axis: 'x',
                from: anchor.x + anchor.width,
                to: candidateRight,
                position: movingCenterY,
              },
            };
          }
        }

        const candidateLeft = anchor.x - referenceGap - width;
        const deltaLeft = candidateLeft - x;
        if (Math.abs(deltaLeft) < threshold) {
          if (!best || Math.abs(deltaLeft) < Math.abs(best.delta)) {
            best = {
              delta: deltaLeft,
              indicator: {
                axis: 'x',
                from: candidateLeft + width,
                to: anchor.x,
                position: movingCenterY,
              },
            };
          }
        }
      }
    }
  }

  return best;
}

function findEqualSpacingSnapY(
  x: number,
  y: number,
  width: number,
  height: number,
  otherShapes: Shape[],
  threshold: number,
): EqualSpacingSnap | null {
  let best: EqualSpacingSnap | null = null;
  const movingCenterX = x + width / 2;

  for (const topRef of otherShapes) {
    for (const bottomRef of otherShapes) {
      if (topRef.id === bottomRef.id) continue;
      if (!overlapsOnX(topRef, bottomRef)) continue;

      const referenceGap = bottomRef.y - (topRef.y + topRef.height);
      if (referenceGap <= 0) continue;

      for (const anchor of otherShapes) {
        if (!overlapsOnX(anchor, { x, width })) continue;

        const candidateBelow = anchor.y + anchor.height + referenceGap;
        const deltaBelow = candidateBelow - y;
        if (Math.abs(deltaBelow) < threshold) {
          if (!best || Math.abs(deltaBelow) < Math.abs(best.delta)) {
            best = {
              delta: deltaBelow,
              indicator: {
                axis: 'y',
                from: anchor.y + anchor.height,
                to: candidateBelow,
                position: movingCenterX,
              },
            };
          }
        }

        const candidateAbove = anchor.y - referenceGap - height;
        const deltaAbove = candidateAbove - y;
        if (Math.abs(deltaAbove) < threshold) {
          if (!best || Math.abs(deltaAbove) < Math.abs(best.delta)) {
            best = {
              delta: deltaAbove,
              indicator: {
                axis: 'y',
                from: candidateAbove + height,
                to: anchor.y,
                position: movingCenterX,
              },
            };
          }
        }
      }
    }
  }

  return best;
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
  parentFrame?: ParentFrameRect,
  guides?: GuideSnapTarget[],
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
  let equalSpacingX: EqualSpacingSnap | null = null;
  let equalSpacingY: EqualSpacingSnap | null = null;

  const matchEdge = (
    axis: 'x' | 'y',
    myEdge: number,
    otherEdge: number,
    otherEdges: ShapeEdges,
  ) => {
    const d = Math.abs(myEdge - otherEdge);
    if (axis === 'x') {
      if (d < bestDx) {
        bestDx = d;
        snappedX = x + (otherEdge - myEdge);
        bestXCandidates = [{ position: otherEdge, otherEdges }];
      } else if (d === bestDx && bestDx < threshold) {
        bestXCandidates.push({ position: otherEdge, otherEdges });
      }
    } else {
      if (d < bestDy) {
        bestDy = d;
        snappedY = y + (otherEdge - myEdge);
        bestYCandidates = [{ position: otherEdge, otherEdges }];
      } else if (d === bestDy && bestDy < threshold) {
        bestYCandidates.push({ position: otherEdge, otherEdges });
      }
    }
  };

  if (parentFrame) {
    const pLeft = parentFrame.x + parentFrame.paddingLeft;
    const pRight = parentFrame.x + parentFrame.width - parentFrame.paddingRight;
    const pTop = parentFrame.y + parentFrame.paddingTop;
    const pBottom = parentFrame.y + parentFrame.height - parentFrame.paddingBottom;
    const pCenterX = parentFrame.x + parentFrame.width / 2;
    const pCenterY = parentFrame.y + parentFrame.height / 2;

    const parentEdges: ShapeEdges = {
      left: parentFrame.x,
      right: parentFrame.x + parentFrame.width,
      centerX: pCenterX,
      top: parentFrame.y,
      bottom: parentFrame.y + parentFrame.height,
      centerY: pCenterY,
    };

    const xTargets = [parentFrame.x, pLeft, pCenterX, pRight, parentFrame.x + parentFrame.width];
    const yTargets = [parentFrame.y, pTop, pCenterY, pBottom, parentFrame.y + parentFrame.height];

    const uniqueX = [...new Set(xTargets)];
    const uniqueY = [...new Set(yTargets)];

    for (const myEdge of [movingEdges.left, movingEdges.centerX, movingEdges.right]) {
      for (const otherEdge of uniqueX) {
        matchEdge('x', myEdge, otherEdge, parentEdges);
      }
    }

    for (const myEdge of [movingEdges.top, movingEdges.centerY, movingEdges.bottom]) {
      for (const otherEdge of uniqueY) {
        matchEdge('y', myEdge, otherEdge, parentEdges);
      }
    }
  }

  for (const shape of otherShapes) {
    const edges = getEdges(shape.x, shape.y, shape.width, shape.height);

    for (const myEdge of [movingEdges.left, movingEdges.centerX, movingEdges.right]) {
      for (const otherEdge of [edges.left, edges.centerX, edges.right]) {
        matchEdge('x', myEdge, otherEdge, edges);
      }
    }

    for (const myEdge of [movingEdges.top, movingEdges.centerY, movingEdges.bottom]) {
      for (const otherEdge of [edges.top, edges.centerY, edges.bottom]) {
        matchEdge('y', myEdge, otherEdge, edges);
      }
    }
  }

  if (guides) {
    const LARGE = 100000;
    for (const guide of guides) {
      if (guide.axis === 'x') {
        const guideEdges: ShapeEdges = {
          left: guide.position,
          centerX: guide.position,
          right: guide.position,
          top: -LARGE,
          centerY: 0,
          bottom: LARGE,
        };
        for (const myEdge of [movingEdges.left, movingEdges.centerX, movingEdges.right]) {
          matchEdge('x', myEdge, guide.position, guideEdges);
        }
      } else {
        const guideEdges: ShapeEdges = {
          left: -LARGE,
          centerX: 0,
          right: LARGE,
          top: guide.position,
          centerY: guide.position,
          bottom: guide.position,
        };
        for (const myEdge of [movingEdges.top, movingEdges.centerY, movingEdges.bottom]) {
          matchEdge('y', myEdge, guide.position, guideEdges);
        }
      }
    }
  }

  const equalSnapX = findEqualSpacingSnapX(x, y, width, height, otherShapes, threshold);
  if (equalSnapX && Math.abs(equalSnapX.delta) < bestDx) {
    bestDx = Math.abs(equalSnapX.delta);
    snappedX = x + equalSnapX.delta;
    bestXCandidates = [];
    equalSpacingX = equalSnapX;
  }

  const equalSnapY = findEqualSpacingSnapY(x, y, width, height, otherShapes, threshold);
  if (equalSnapY && Math.abs(equalSnapY.delta) < bestDy) {
    bestDy = Math.abs(equalSnapY.delta);
    snappedY = y + equalSnapY.delta;
    bestYCandidates = [];
    equalSpacingY = equalSnapY;
  }

  const snappedMovingEdges = getEdges(snappedX, snappedY, width, height);
  const snapLines: SnapLine[] = [];
  const seenLines = new Set<string>();

  for (const candidate of bestXCandidates) {
    const extent = computeSnapLineExtent('x', snappedMovingEdges, candidate.otherEdges);
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
    const extent = computeSnapLineExtent('y', snappedMovingEdges, candidate.otherEdges);
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

  if (equalSpacingX) {
    distanceIndicators.push(equalSpacingX.indicator);
  }

  if (equalSpacingY) {
    distanceIndicators.push(equalSpacingY.indicator);
  }

  return { x: snappedX, y: snappedY, snapLines, distanceIndicators };
}
