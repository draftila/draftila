import type { Shape, ShapeType } from '@draftila/shared';
import type { LayerDropPlacement } from '@draftila/engine/scene-graph';
import {
  Square,
  Circle,
  Frame,
  Type,
  Pen,
  Group,
  Minus,
  Hexagon,
  Star,
  MoveRight,
  Image,
  FileImage,
  Diamond,
} from 'lucide-react';
import { createElement } from 'react';

export interface LayerRow {
  shape: Shape;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  effectiveVisible: boolean;
  effectiveLocked: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  targetId: string;
}

export interface DragState {
  draggingIds: string[];
  overId: string | null;
  placement: LayerDropPlacement | null;
}

const iconClass = 'h-3.5 w-3.5';

export const SHAPE_ICONS: Record<ShapeType, React.ReactNode> = {
  rectangle: createElement(Square, { className: iconClass }),
  ellipse: createElement(Circle, { className: iconClass }),
  frame: createElement(Frame, { className: iconClass }),
  text: createElement(Type, { className: iconClass }),
  path: createElement(Pen, { className: iconClass }),
  line: createElement(Minus, { className: iconClass }),
  polygon: createElement(Hexagon, { className: iconClass }),
  star: createElement(Star, { className: iconClass }),

  image: createElement(Image, { className: iconClass }),
  svg: createElement(FileImage, { className: iconClass }),
  group: createElement(Group, { className: iconClass }),
};

export const INSTANCE_ICON = createElement(Diamond, { className: iconClass });
