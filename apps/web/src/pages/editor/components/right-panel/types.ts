import type { Shape } from '@draftila/shared';
import type * as Y from 'yjs';
import type { ComponentType } from 'react';

export interface PropertySectionProps {
  ydoc: Y.Doc;
  shape: Shape;
  shapeScope: Shape[];
  onUpdate: (props: Partial<Shape>) => void;
  /**
   * True when the section is editing several shapes at once. `shape` is then
   * only the first of them and `onUpdate` fans out, so anything per-shape —
   * colour variable bindings especially — must be suppressed.
   */
  multiSelect?: boolean;
}

export type PropertySection = ComponentType<PropertySectionProps>;
