import type { Shape } from '@draftila/shared';

export interface LayerTreeNode {
  shape: Shape;
  children: LayerTreeNode[];
}

export type StackMoveDirection = 'forward' | 'backward' | 'front' | 'back';
export type LayerDropPlacement = 'before' | 'after' | 'inside';

export interface ShapeChanges {
  added: string[];
  updated: string[];
  deleted: string[];
  orderChanged?: boolean;
}

export type ShapeChangeCallback = (changes: ShapeChanges) => void;
