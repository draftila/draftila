export type HorizontalConstraint = 'left' | 'right' | 'left-right' | 'center' | 'scale';
export type VerticalConstraint = 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale';

export interface Constraints {
  horizontal: HorizontalConstraint;
  vertical: VerticalConstraint;
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  horizontal: 'left',
  vertical: 'top',
};

export function applyConstraints(
  child: { x: number; y: number; width: number; height: number },
  constraints: Constraints,
  parentOld: { width: number; height: number },
  parentNew: { width: number; height: number },
  originalChild: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = child;

  const dx = parentNew.width - parentOld.width;
  const dy = parentNew.height - parentOld.height;

  switch (constraints.horizontal) {
    case 'left':
      break;
    case 'right':
      x += dx;
      break;
    case 'left-right':
      width += dx;
      break;
    case 'center':
      x += dx / 2;
      break;
    case 'scale': {
      const scaleX = parentNew.width / parentOld.width;
      x = originalChild.x * scaleX;
      width = originalChild.width * scaleX;
      break;
    }
  }

  switch (constraints.vertical) {
    case 'top':
      break;
    case 'bottom':
      y += dy;
      break;
    case 'top-bottom':
      height += dy;
      break;
    case 'center':
      y += dy / 2;
      break;
    case 'scale': {
      const scaleY = parentNew.height / parentOld.height;
      y = originalChild.y * scaleY;
      height = originalChild.height * scaleY;
      break;
    }
  }

  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}
