import type { Shape } from '@draftila/shared';
import { getShape } from '../scene-graph';
import type * as Y from 'yjs';

export function sortByDepth(ydoc: Y.Doc, parentIds: Set<string>): string[] {
  const depths = new Map<string, number>();
  for (const id of parentIds) {
    let depth = 0;
    let current = getShape(ydoc, id);
    while (current?.parentId) {
      depth++;
      current = getShape(ydoc, current.parentId);
    }
    depths.set(id, depth);
  }
  return [...parentIds].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
}

export function collectShapesWithDescendants(allShapes: Shape[], rootIds: string[]): Shape[] {
  const rootSet = new Set(rootIds);
  const collected = new Set<string>();

  function addDescendants(id: string) {
    if (collected.has(id)) return;
    collected.add(id);
    for (const s of allShapes) {
      if (s.parentId === id) {
        addDescendants(s.id);
      }
    }
  }

  for (const id of rootIds) {
    addDescendants(id);
  }

  return allShapes.filter((s) => collected.has(s.id) || rootSet.has(s.id));
}

export function toAbsoluteProps(
  ydoc: Y.Doc,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const parentId = props['parentId'] as string | undefined;
  if (!parentId) return props;
  const parent = getShape(ydoc, parentId);
  if (!parent) return props;
  const out = { ...props };
  if (typeof out['x'] === 'number') out['x'] = (out['x'] as number) + parent.x;
  if (typeof out['y'] === 'number') out['y'] = (out['y'] as number) + parent.y;
  return out;
}

export function applyTextDefaults(props: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  if (out['textAutoResize'] === undefined) out['textAutoResize'] = 'width';
  if (out['textAlign'] === undefined) out['textAlign'] = 'center';
  const fontSize = (out['fontSize'] as number) ?? 16;
  const lineHeight = (out['lineHeight'] as number) ?? 1.2;
  const lineHeightPx = fontSize * lineHeight;
  const glyphHeight = fontSize * 1.2;
  const vOverflow = Math.max(0, glyphHeight - lineHeightPx);
  if (out['height'] === undefined) out['height'] = Math.ceil(lineHeightPx + vOverflow);
  if (out['width'] === undefined) out['width'] = 200;
  return out;
}

export function toRelativeShape(ydoc: Y.Doc, shape: Shape): Shape {
  if (!shape.parentId) return shape;
  const parent = getShape(ydoc, shape.parentId);
  if (!parent) return shape;
  return { ...shape, x: shape.x - parent.x, y: shape.y - parent.y };
}
