import type { Shape } from '@draftila/shared';

export type CodeFormat =
  | 'css'
  | 'css-all-layers'
  | 'tailwind'
  | 'tailwind-all-layers'
  | 'swiftui'
  | 'compose'
  | 'html-css'
  | 'html-tailwind';

export interface ShapeTreeNode {
  shape: Shape;
  children: ShapeTreeNode[];
}
