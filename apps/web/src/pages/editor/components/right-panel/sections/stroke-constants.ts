import type {
  ArrowheadType,
  Stroke,
  StrokeAlign,
  StrokeCap,
  StrokeDashPattern,
  StrokeJoin,
} from '@draftila/shared';
import {
  AlignCenterIcon,
  AlignInsideIcon,
  AlignOutsideIcon,
  CapButtIcon,
  CapRoundIcon,
  CapSquareIcon,
  EndpointCircleArrowIcon,
  EndpointDiamondArrowIcon,
  EndpointLineArrowIcon,
  EndpointNoneIcon,
  EndpointReversedTriangleIcon,
  EndpointTriangleArrowIcon,
  JoinBevelIcon,
  JoinMiterIcon,
  JoinRoundIcon,
} from './stroke-icons';

export const CHECKERBOARD =
  'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

export const DEFAULT_STROKE: Stroke = {
  color: '#000000',
  width: 1,
  opacity: 1,
  visible: true,
  cap: 'butt',
  join: 'miter',
  align: 'inside',
  dashPattern: 'solid',
  dashOffset: 0,
  miterLimit: 4,
};

export const ARROWHEAD_LABELS: Record<ArrowheadType, string> = {
  none: 'None',
  line_arrow: 'Line arrow',
  triangle_arrow: 'Triangle arrow',
  reversed_triangle: 'Reversed triangle',
  circle_arrow: 'Circle arrow',
  diamond_arrow: 'Diamond arrow',
};

export interface EndpointOption {
  value: ArrowheadType;
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
}

export const ENDPOINT_OPTIONS: EndpointOption[] = [
  { value: 'none', label: 'None', Icon: EndpointNoneIcon },
  { value: 'line_arrow', label: 'Line arrow', Icon: EndpointLineArrowIcon },
  { value: 'triangle_arrow', label: 'Triangle arrow', Icon: EndpointTriangleArrowIcon },
  { value: 'reversed_triangle', label: 'Reversed triangle', Icon: EndpointReversedTriangleIcon },
  { value: 'circle_arrow', label: 'Circle arrow', Icon: EndpointCircleArrowIcon },
  { value: 'diamond_arrow', label: 'Diamond arrow', Icon: EndpointDiamondArrowIcon },
];

export function endpointIcon(
  val: ArrowheadType,
): (props: { className?: string }) => React.JSX.Element {
  const match = ENDPOINT_OPTIONS.find((o) => o.value === val);
  return match?.Icon ?? EndpointNoneIcon;
}

export const CAP_OPTIONS: Array<{ value: StrokeCap; label: string; Icon: typeof CapButtIcon }> = [
  { value: 'butt', label: 'None', Icon: CapButtIcon },
  { value: 'round', label: 'Round', Icon: CapRoundIcon },
  { value: 'square', label: 'Square', Icon: CapSquareIcon },
];

export const JOIN_OPTIONS: Array<{
  value: StrokeJoin;
  label: string;
  Icon: typeof JoinMiterIcon;
}> = [
  { value: 'miter', label: 'Miter', Icon: JoinMiterIcon },
  { value: 'round', label: 'Round', Icon: JoinRoundIcon },
  { value: 'bevel', label: 'Bevel', Icon: JoinBevelIcon },
];

export const ALIGN_OPTIONS: Array<{
  value: StrokeAlign;
  label: string;
  Icon: typeof AlignCenterIcon;
}> = [
  { value: 'center', label: 'Center', Icon: AlignCenterIcon },
  { value: 'inside', label: 'Inside', Icon: AlignInsideIcon },
  { value: 'outside', label: 'Outside', Icon: AlignOutsideIcon },
];

export const DASH_OPTIONS: StrokeDashPattern[] = ['solid', 'dash', 'dot', 'dash-dot'];

export function dashPatternLabel(pattern: StrokeDashPattern) {
  const labels: Record<StrokeDashPattern, string> = {
    solid: 'Solid',
    dash: 'Dashed',
    dot: 'Dotted',
    'dash-dot': 'Dash Dot',
  };
  return labels[pattern];
}
