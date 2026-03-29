import type { Shape } from '@draftila/shared';

export type CodeFormat = 'css' | 'css-all-layers' | 'swiftui' | 'compose';

export interface ShapeTreeNode {
  shape: Shape;
  children: ShapeTreeNode[];
}
