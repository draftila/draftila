import type { Shape } from '@draftila/shared';
import type { ComponentType } from 'react';

export interface PropertySectionProps {
  shape: Shape;
  onUpdate: (props: Partial<Shape>) => void;
}

export type PropertySection = ComponentType<PropertySectionProps>;
