import type { Shape } from '@draftila/shared';

export function filterEffectivelyVisibleShapes(shapes: Shape[]): Shape[] {
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

  const isEffectivelyVisible = (shape: Shape): boolean => {
    if (!shape.visible) return false;

    let currentParentId = shape.parentId ?? null;
    while (currentParentId) {
      const parent = shapeMap.get(currentParentId);
      if (!parent) return false;
      if (!parent.visible) return false;
      currentParentId = parent.parentId ?? null;
    }

    return true;
  };

  return shapes.filter(isEffectivelyVisible);
}

export function createCanvasScopeShape(scopeShapes: Shape[]): Shape {
  if (scopeShapes.length === 0) {
    return {
      id: 'canvas-scope',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      parentId: null,
      opacity: 1,
      locked: true,
      visible: true,
      name: 'Canvas',
      blendMode: 'normal',
      fills: [{ color: '#FFFFFF', opacity: 1, visible: false }],
      strokes: [],
      cornerRadius: 0,
      cornerSmoothing: 0,
      shadows: [],
      blurs: [],
      layoutSizingHorizontal: 'fixed',
      layoutSizingVertical: 'fixed',
      constraintHorizontal: 'left',
      constraintVertical: 'top',
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of scopeShapes) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  return {
    id: 'canvas-scope',
    type: 'rectangle',
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    rotation: 0,
    parentId: null,
    opacity: 1,
    locked: true,
    visible: true,
    name: 'Canvas',
    blendMode: 'normal',
    fills: [{ color: '#FFFFFF', opacity: 1, visible: false }],
    strokes: [],
    cornerRadius: 0,
    cornerSmoothing: 0,
    shadows: [],
    blurs: [],
    layoutSizingHorizontal: 'fixed',
    layoutSizingVertical: 'fixed',
    constraintHorizontal: 'left',
    constraintVertical: 'top',
  };
}
