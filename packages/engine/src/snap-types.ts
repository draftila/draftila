export interface ShapeEdges {
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
}

export const SNAP_THRESHOLD = 5;

export function getEdges(x: number, y: number, w: number, h: number): ShapeEdges {
  return {
    left: x,
    centerX: x + w / 2,
    right: x + w,
    top: y,
    centerY: y + h / 2,
    bottom: y + h,
  };
}

export function computeSnapLineExtent(
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

export interface ParentFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export interface GuideSnapTarget {
  axis: 'x' | 'y';
  position: number;
}
