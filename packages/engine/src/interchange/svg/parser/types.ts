import type {
  InterchangeGradient,
  InterchangeClipPath,
  InterchangeShadow,
  InterchangeBlur,
} from '../../interchange-format';

export interface ParseSvgOptions {
  mode?: 'editable' | 'fidelity';
}

export interface ParseCtx {
  gradients: Map<string, InterchangeGradient>;
  patterns: Map<string, string>;
  clipPaths: Map<string, InterchangeClipPath>;
  masks: Map<string, InterchangeClipPath>;
  filters: Map<string, { shadows: InterchangeShadow[]; blurs: InterchangeBlur[] }>;
  symbols: Map<string, Element>;
  inheritedFillNone: boolean;
  inheritedFill: string | null;
  inheritedStroke: string | null;
  inheritedStrokeWidth: number | null;
  inheritedStrokeCap: string | null;
  inheritedStrokeJoin: string | null;
  parentMatrix: DOMMatrix;
}
