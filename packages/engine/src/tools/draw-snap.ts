import type * as Y from 'yjs';
import { getAllShapes } from '../scene-graph';
import { type SnapLine, type DistanceIndicator, type GuideSnapTarget } from '../snap';

export interface DrawSnapState {
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

function computeExtent(
  axis: 'x' | 'y',
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

interface CursorSnapResult {
  x: number;
  y: number;
  snapLines: SnapLine[];
}

function snapCursorPoint(
  cursorX: number,
  cursorY: number,
  anchorX: number,
  anchorY: number,
  otherShapes: Array<{ x: number; y: number; width: number; height: number }>,
  zoom: number,
  guides?: GuideSnapTarget[],
): CursorSnapResult {
  const threshold = SNAP_THRESHOLD / zoom;

  let snappedX = cursorX;
  let snappedY = cursorY;
  let bestDx = threshold;
  let bestDy = threshold;

  interface SnapCandidate {
    position: number;
    otherEdges: ShapeEdges;
  }

  let bestXCandidates: SnapCandidate[] = [];
  let bestYCandidates: SnapCandidate[] = [];

  for (const shape of otherShapes) {
    const edges = getEdges(shape.x, shape.y, shape.width, shape.height);

    for (const otherEdge of [edges.left, edges.centerX, edges.right]) {
      const d = Math.abs(cursorX - otherEdge);
      if (d < bestDx) {
        bestDx = d;
        snappedX = otherEdge;
        bestXCandidates = [{ position: otherEdge, otherEdges: edges }];
      } else if (d === bestDx && bestDx < threshold) {
        bestXCandidates.push({ position: otherEdge, otherEdges: edges });
      }
    }

    for (const otherEdge of [edges.top, edges.centerY, edges.bottom]) {
      const d = Math.abs(cursorY - otherEdge);
      if (d < bestDy) {
        bestDy = d;
        snappedY = otherEdge;
        bestYCandidates = [{ position: otherEdge, otherEdges: edges }];
      } else if (d === bestDy && bestDy < threshold) {
        bestYCandidates.push({ position: otherEdge, otherEdges: edges });
      }
    }
  }

  if (guides) {
    const LARGE = 100000;
    for (const guide of guides) {
      if (guide.axis === 'x') {
        const d = Math.abs(cursorX - guide.position);
        const guideEdges: ShapeEdges = {
          left: guide.position,
          centerX: guide.position,
          right: guide.position,
          top: -LARGE,
          centerY: 0,
          bottom: LARGE,
        };
        if (d < bestDx) {
          bestDx = d;
          snappedX = guide.position;
          bestXCandidates = [{ position: guide.position, otherEdges: guideEdges }];
        } else if (d === bestDx && bestDx < threshold) {
          bestXCandidates.push({ position: guide.position, otherEdges: guideEdges });
        }
      } else {
        const d = Math.abs(cursorY - guide.position);
        const guideEdges: ShapeEdges = {
          left: -LARGE,
          centerX: 0,
          right: LARGE,
          top: guide.position,
          centerY: guide.position,
          bottom: guide.position,
        };
        if (d < bestDy) {
          bestDy = d;
          snappedY = guide.position;
          bestYCandidates = [{ position: guide.position, otherEdges: guideEdges }];
        } else if (d === bestDy && bestDy < threshold) {
          bestYCandidates.push({ position: guide.position, otherEdges: guideEdges });
        }
      }
    }
  }

  const rectX = Math.min(anchorX, snappedX);
  const rectY = Math.min(anchorY, snappedY);
  const rectW = Math.abs(snappedX - anchorX);
  const rectH = Math.abs(snappedY - anchorY);
  const movingEdges = getEdges(rectX, rectY, rectW, rectH);

  const snapLines: SnapLine[] = [];
  const seenLines = new Set<string>();

  for (const candidate of bestXCandidates) {
    const extent = computeExtent('x', movingEdges, candidate.otherEdges);
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
    const extent = computeExtent('y', movingEdges, candidate.otherEdges);
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

  return { x: snappedX, y: snappedY, snapLines };
}

export function snapDrawnRect(
  ydoc: Y.Doc,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  shiftKey: boolean,
  altKey: boolean,
  zoom: number,
  guides?: GuideSnapTarget[],
): {
  rect: { x: number; y: number; width: number; height: number };
  snap: DrawSnapState;
} {
  let cursorX = endX;
  let cursorY = endY;

  if (shiftKey) {
    const rawW = cursorX - startX;
    const rawH = cursorY - startY;
    const size = Math.max(Math.abs(rawW), Math.abs(rawH));
    cursorX = startX + (rawW >= 0 ? size : -size);
    cursorY = startY + (rawH >= 0 ? size : -size);
  }

  const shapes = getAllShapes(ydoc).filter((s) => s.visible && !s.locked);

  const snapped = snapCursorPoint(cursorX, cursorY, startX, startY, shapes, zoom, guides);

  let finalCursorX = snapped.x;
  let finalCursorY = snapped.y;

  if (shiftKey) {
    const dxSnapped = finalCursorX - startX;
    const dySnapped = finalCursorY - startY;
    const size = Math.max(Math.abs(dxSnapped), Math.abs(dySnapped));
    finalCursorX = startX + (dxSnapped >= 0 ? size : -size);
    finalCursorY = startY + (dySnapped >= 0 ? size : -size);
  }

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (altKey) {
    const hw = Math.abs(finalCursorX - startX);
    const hh = Math.abs(finalCursorY - startY);
    x = startX - hw;
    y = startY - hh;
    width = hw * 2;
    height = hh * 2;
  } else {
    x = Math.min(startX, finalCursorX);
    y = Math.min(startY, finalCursorY);
    width = Math.abs(finalCursorX - startX);
    height = Math.abs(finalCursorY - startY);
  }

  return {
    rect: {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    },
    snap: { snapLines: snapped.snapLines, distanceIndicators: [] },
  };
}

export function snapDrawnLine(
  ydoc: Y.Doc,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zoom: number,
  guides?: GuideSnapTarget[],
): {
  line: { x1: number; y1: number; x2: number; y2: number };
  snap: DrawSnapState;
} {
  const shapes = getAllShapes(ydoc).filter((s) => s.visible && !s.locked);
  const snapped = snapCursorPoint(x2, y2, x1, y1, shapes, zoom, guides);
  return {
    line: { x1, y1, x2: Math.round(snapped.x), y2: Math.round(snapped.y) },
    snap: { snapLines: snapped.snapLines, distanceIndicators: [] },
  };
}

export function snapDrawnTextRect(
  ydoc: Y.Doc,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  zoom: number,
  guides?: GuideSnapTarget[],
): {
  rect: { x: number; y: number; width: number; height: number };
  snap: DrawSnapState;
} {
  const shapes = getAllShapes(ydoc).filter((s) => s.visible && !s.locked);
  const snapped = snapCursorPoint(endX, endY, startX, startY, shapes, zoom, guides);

  const x = Math.round(Math.min(startX, snapped.x));
  const y = Math.round(Math.min(startY, snapped.y));
  const width = Math.round(Math.abs(snapped.x - startX));
  const height = Math.round(Math.abs(snapped.y - startY));

  return {
    rect: { x, y, width, height },
    snap: { snapLines: snapped.snapLines, distanceIndicators: [] },
  };
}
