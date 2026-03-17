import type { Shape } from '@draftila/shared';
import type * as Y from 'yjs';
import type { ComponentType } from 'react';

export interface PropertySectionProps {
  ydoc: Y.Doc;
  shape: Shape;
  shapeScope: Shape[];
  onUpdate: (props: Partial<Shape>) => void;
}

export type PropertySection = ComponentType<PropertySectionProps>;
