import type { Shape } from '@draftila/shared';

export interface LayerTreeNode {
  shape: Shape;
  children: LayerTreeNode[];
}

export type StackMoveDirection = 'forward' | 'backward' | 'front' | 'back';
export type LayerDropPlacement = 'before' | 'after' | 'inside';

export type ShapeChangeCallback = (changes: {
  added: string[];
  updated: string[];
  deleted: string[];
}) => void;
