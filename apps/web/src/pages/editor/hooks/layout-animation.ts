const LERP_SPEED = 0.15;
const SETTLE_THRESHOLD = 0.5;

interface AnimatingPosition {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
}

const animating = new Map<string, AnimatingPosition>();

export function updateLayoutAnimation(
  preview: ReadonlyMap<string, { x: number; y: number }> | null,
  shapePositions: ReadonlyMap<string, { x: number; y: number }>,
): void {
  if (preview) {
    for (const [id, target] of preview) {
      const existing = animating.get(id);
      if (existing) {
        existing.targetX = target.x;
        existing.targetY = target.y;
      } else {
        const original = shapePositions.get(id);
        animating.set(id, {
          currentX: original?.x ?? target.x,
          currentY: original?.y ?? target.y,
          targetX: target.x,
          targetY: target.y,
        });
      }
    }
  }

  for (const [id, anim] of animating) {
    const target = preview?.get(id);
    if (!target) {
      const original = shapePositions.get(id);
      if (original) {
        anim.targetX = original.x;
        anim.targetY = original.y;
      }
    }
  }

  for (const [id, anim] of animating) {
    anim.currentX += (anim.targetX - anim.currentX) * LERP_SPEED;
    anim.currentY += (anim.targetY - anim.currentY) * LERP_SPEED;

    const dx = Math.abs(anim.targetX - anim.currentX);
    const dy = Math.abs(anim.targetY - anim.currentY);

    if (dx < SETTLE_THRESHOLD && dy < SETTLE_THRESHOLD) {
      const isReturning = !preview?.has(id);
      if (isReturning) {
        animating.delete(id);
      } else {
        anim.currentX = anim.targetX;
        anim.currentY = anim.targetY;
      }
    }
  }
}

export function getAnimatedPosition(id: string): { x: number; y: number } | null {
  const anim = animating.get(id);
  if (!anim) return null;
  return { x: anim.currentX, y: anim.currentY };
}
