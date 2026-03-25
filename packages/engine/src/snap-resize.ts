import type { Shape } from '@draftila/shared';
import {
  type ShapeEdges,
  type SnapLine,
  type ParentFrameRect,
  type GuideSnapTarget,
  SNAP_THRESHOLD,
  getEdges,
  computeSnapLineExtent,
} from './snap-types';

export interface ResizeSnapEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export interface ResizeSnapResult {
  bounds: { x: number; y: number; width: number; height: number };
  snapLines: SnapLine[];
}

export function snapResize(
  bounds: { x: number; y: number; width: number; height: number },
  movingEdges: ResizeSnapEdges,
  otherShapes: Shape[],
  zoom: number,
  parentFrame?: ParentFrameRect,
  guides?: GuideSnapTarget[],
): ResizeSnapResult {
  const threshold = SNAP_THRESHOLD / zoom;

  let { x, y, width, height } = bounds;
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;

  let bestDxLeft = threshold;
  let bestDxRight = threshold;
  let bestDyTop = threshold;
  let bestDyBottom = threshold;

  let snapLeftTo: number | null = null;
  let snapRightTo: number | null = null;
  let snapTopTo: number | null = null;
  let snapBottomTo: number | null = null;

  interface EdgeCandidate {
    otherEdges: ShapeEdges;
  }

  let leftCandidates: EdgeCandidate[] = [];
  let rightCandidates: EdgeCandidate[] = [];
  let topCandidates: EdgeCandidate[] = [];
  let bottomCandidates: EdgeCandidate[] = [];

  const allTargets: Array<{ edges: ShapeEdges }> = [];

  for (const shape of otherShapes) {
    allTargets.push({ edges: getEdges(shape.x, shape.y, shape.width, shape.height) });
  }

  if (parentFrame) {
    const pLeft = parentFrame.x + parentFrame.paddingLeft;
    const pRight = parentFrame.x + parentFrame.width - parentFrame.paddingRight;
    const pTop = parentFrame.y + parentFrame.paddingTop;
    const pBottom = parentFrame.y + parentFrame.height - parentFrame.paddingBottom;
    const pCenterX = parentFrame.x + parentFrame.width / 2;
    const pCenterY = parentFrame.y + parentFrame.height / 2;

    allTargets.push({
      edges: {
        left: parentFrame.x,
        right: parentFrame.x + parentFrame.width,
        centerX: pCenterX,
        top: parentFrame.y,
        bottom: parentFrame.y + parentFrame.height,
        centerY: pCenterY,
      },
    });

    if (
      parentFrame.paddingLeft > 0 ||
      parentFrame.paddingRight > 0 ||
      parentFrame.paddingTop > 0 ||
      parentFrame.paddingBottom > 0
    ) {
      allTargets.push({
        edges: {
          left: pLeft,
          right: pRight,
          centerX: pCenterX,
          top: pTop,
          bottom: pBottom,
          centerY: pCenterY,
        },
      });
    }
  }

  if (guides) {
    const LARGE = 100000;
    for (const guide of guides) {
      if (guide.axis === 'x') {
        allTargets.push({
          edges: {
            left: guide.position,
            centerX: guide.position,
            right: guide.position,
            top: -LARGE,
            centerY: 0,
            bottom: LARGE,
          },
        });
      } else {
        allTargets.push({
          edges: {
            left: -LARGE,
            centerX: 0,
            right: LARGE,
            top: guide.position,
            centerY: guide.position,
            bottom: guide.position,
          },
        });
      }
    }
  }

  const matchX = (myEdge: number, side: 'left' | 'right', otherEdges: ShapeEdges) => {
    for (const otherEdge of [otherEdges.left, otherEdges.centerX, otherEdges.right]) {
      const d = Math.abs(myEdge - otherEdge);
      if (side === 'left') {
        if (d < bestDxLeft) {
          bestDxLeft = d;
          snapLeftTo = otherEdge;
          leftCandidates = [{ otherEdges }];
        } else if (d === bestDxLeft && bestDxLeft < threshold) {
          leftCandidates.push({ otherEdges });
        }
      } else {
        if (d < bestDxRight) {
          bestDxRight = d;
          snapRightTo = otherEdge;
          rightCandidates = [{ otherEdges }];
        } else if (d === bestDxRight && bestDxRight < threshold) {
          rightCandidates.push({ otherEdges });
        }
      }
    }
  };

  const matchY = (myEdge: number, side: 'top' | 'bottom', otherEdges: ShapeEdges) => {
    for (const otherEdge of [otherEdges.top, otherEdges.centerY, otherEdges.bottom]) {
      const d = Math.abs(myEdge - otherEdge);
      if (side === 'top') {
        if (d < bestDyTop) {
          bestDyTop = d;
          snapTopTo = otherEdge;
          topCandidates = [{ otherEdges }];
        } else if (d === bestDyTop && bestDyTop < threshold) {
          topCandidates.push({ otherEdges });
        }
      } else {
        if (d < bestDyBottom) {
          bestDyBottom = d;
          snapBottomTo = otherEdge;
          bottomCandidates = [{ otherEdges }];
        } else if (d === bestDyBottom && bestDyBottom < threshold) {
          bottomCandidates.push({ otherEdges });
        }
      }
    }
  };

  for (const { edges } of allTargets) {
    if (movingEdges.left) matchX(left, 'left', edges);
    if (movingEdges.right) matchX(right, 'right', edges);
    if (movingEdges.top) matchY(top, 'top', edges);
    if (movingEdges.bottom) matchY(bottom, 'bottom', edges);
  }

  if (movingEdges.left && !movingEdges.right && snapLeftTo !== null) {
    const shift = snapLeftTo - left;
    x += shift;
    width -= shift;
  }

  if (movingEdges.right && !movingEdges.left && snapRightTo !== null) {
    width = snapRightTo - x;
  }

  if (movingEdges.top && !movingEdges.bottom && snapTopTo !== null) {
    const shift = snapTopTo - top;
    y += shift;
    height -= shift;
  }

  if (movingEdges.bottom && !movingEdges.top && snapBottomTo !== null) {
    height = snapBottomTo - y;
  }

  const snappedEdges = getEdges(x, y, width, height);
  const snapLines: SnapLine[] = [];
  const seenLines = new Set<string>();

  const addSnapLines = (candidates: EdgeCandidate[], axis: 'x' | 'y', position: number) => {
    for (const candidate of candidates) {
      const extent = computeSnapLineExtent(axis, snappedEdges, candidate.otherEdges);
      const key = `${axis}:${position}`;
      if (seenLines.has(key)) {
        const existing = snapLines.find((l) => l.axis === axis && l.position === position);
        if (existing) {
          existing.start = Math.min(existing.start, extent.start);
          existing.end = Math.max(existing.end, extent.end);
        }
      } else {
        seenLines.add(key);
        snapLines.push({ axis, position, ...extent });
      }
    }
  };

  if (snapLeftTo !== null) addSnapLines(leftCandidates, 'x', snapLeftTo);
  if (snapRightTo !== null) addSnapLines(rightCandidates, 'x', snapRightTo);
  if (snapTopTo !== null) addSnapLines(topCandidates, 'y', snapTopTo);
  if (snapBottomTo !== null) addSnapLines(bottomCandidates, 'y', snapBottomTo);

  return { bounds: { x, y, width, height }, snapLines };
}
