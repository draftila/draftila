import type { FrameShape, Shape } from '@draftila/shared';

export interface LayoutChild {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutSizingHorizontal: 'fixed' | 'hug' | 'fill';
  layoutSizingVertical: 'fixed' | 'hug' | 'fill';
  visible: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface LayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

type AutoLayoutConfig = ReturnType<typeof getAutoLayoutConfig>;
type ResolvedChild = LayoutChild & { width: number; height: number };

function clampSize(value: number, min?: number, max?: number): number {
  let result = value;
  const effectiveMax = min !== undefined && max !== undefined ? Math.max(min, max) : max;
  if (min !== undefined && result < min) result = min;
  if (effectiveMax !== undefined && result > effectiveMax) result = effectiveMax;
  return result;
}

export function isAutoLayoutFrame(shape: Shape): shape is FrameShape {
  return shape.type === 'frame' && (shape as FrameShape).layoutMode !== 'none';
}

export function getAutoLayoutConfig(frame: FrameShape) {
  return {
    direction: frame.layoutMode as 'horizontal' | 'vertical',
    wrap: ((frame as Record<string, unknown>).layoutWrap ?? 'nowrap') as 'nowrap' | 'wrap',
    gap: frame.layoutGap ?? 0,
    gapColumn: ((frame as Record<string, unknown>).layoutGapColumn as number) ?? 0,
    paddingTop: frame.paddingTop ?? 0,
    paddingRight: frame.paddingRight ?? 0,
    paddingBottom: frame.paddingBottom ?? 0,
    paddingLeft: frame.paddingLeft ?? 0,
    alignItems: (frame.layoutAlign ?? 'start') as 'start' | 'center' | 'end' | 'stretch',
    justifyContent: (frame.layoutJustify ?? 'start').replace('-', '_') as
      | 'start'
      | 'center'
      | 'end'
      | 'space_between'
      | 'space_around',
    sizingHorizontal: (frame.layoutSizingHorizontal ?? 'fixed') as 'fixed' | 'hug' | 'fill',
    sizingVertical: (frame.layoutSizingVertical ?? 'fixed') as 'fixed' | 'hug' | 'fill',
  };
}

export function computeAutoLayout(
  frame: FrameShape,
  children: LayoutChild[],
): { childLayouts: Map<string, LayoutResult>; parentSize: { width: number; height: number } } {
  const config = getAutoLayoutConfig(frame);
  const visibleChildren = children.filter((c) => c.visible);
  const result = new Map<string, LayoutResult>();

  if (visibleChildren.length === 0) {
    const hugW = config.paddingLeft + config.paddingRight;
    const hugH = config.paddingTop + config.paddingBottom;
    return {
      childLayouts: result,
      parentSize: {
        width: config.sizingHorizontal === 'hug' ? hugW : frame.width,
        height: config.sizingVertical === 'hug' ? hugH : frame.height,
      },
    };
  }

  if (config.wrap === 'wrap') {
    return computeWrapLayout(config, frame, visibleChildren);
  }

  return computeLinearLayout(config, frame, visibleChildren);
}

function computeLinearLayout(
  config: AutoLayoutConfig,
  frame: FrameShape,
  visibleChildren: LayoutChild[],
): { childLayouts: Map<string, LayoutResult>; parentSize: { width: number; height: number } } {
  const result = new Map<string, LayoutResult>();
  const isHorizontal = config.direction === 'horizontal';

  let parentWidth = frame.width;
  let parentHeight = frame.height;

  if (config.sizingHorizontal === 'hug' || config.sizingVertical === 'hug') {
    const hugSize = computeHugSize(config, visibleChildren, isHorizontal);
    if (config.sizingHorizontal === 'hug') parentWidth = hugSize.width;
    if (config.sizingVertical === 'hug') parentHeight = hugSize.height;
  }

  const contentWidth = parentWidth - config.paddingLeft - config.paddingRight;
  const contentHeight = parentHeight - config.paddingTop - config.paddingBottom;

  const fillChildCount = visibleChildren.filter((c) =>
    isHorizontal ? c.layoutSizingHorizontal === 'fill' : c.layoutSizingVertical === 'fill',
  ).length;

  const fixedMainTotal = visibleChildren.reduce((sum, c) => {
    if (isHorizontal && c.layoutSizingHorizontal === 'fill') return sum;
    if (!isHorizontal && c.layoutSizingVertical === 'fill') return sum;
    return sum + (isHorizontal ? c.width : c.height);
  }, 0);

  const totalGap = Math.max(0, visibleChildren.length - 1) * config.gap;
  const mainAxisSpace = isHorizontal ? contentWidth : contentHeight;
  const fillSpace = Math.max(0, mainAxisSpace - fixedMainTotal - totalGap);
  const fillChildSize = fillChildCount > 0 ? fillSpace / fillChildCount : 0;

  const resolvedSizes = visibleChildren.map((child) => {
    let w = child.width;
    let h = child.height;

    if (isHorizontal) {
      if (child.layoutSizingHorizontal === 'fill') w = fillChildSize;
      if (child.layoutSizingVertical === 'fill' || config.alignItems === 'stretch')
        h = contentHeight;
    } else {
      if (child.layoutSizingVertical === 'fill') h = fillChildSize;
      if (child.layoutSizingHorizontal === 'fill' || config.alignItems === 'stretch')
        w = contentWidth;
    }

    return {
      ...child,
      width: Math.max(0, clampSize(w, child.minWidth, child.maxWidth)),
      height: Math.max(0, clampSize(h, child.minHeight, child.maxHeight)),
    };
  });

  positionLine(config, resolvedSizes, result, isHorizontal, mainAxisSpace, {
    mainStart: isHorizontal ? config.paddingLeft : config.paddingTop,
    crossStart: isHorizontal ? config.paddingTop : config.paddingLeft,
    crossSize: isHorizontal ? contentHeight : contentWidth,
  });

  return {
    childLayouts: result,
    parentSize: { width: parentWidth, height: parentHeight },
  };
}

function computeWrapLayout(
  config: AutoLayoutConfig,
  frame: FrameShape,
  visibleChildren: LayoutChild[],
): { childLayouts: Map<string, LayoutResult>; parentSize: { width: number; height: number } } {
  const result = new Map<string, LayoutResult>();
  const isHorizontal = config.direction === 'horizontal';

  const mainAxisFixed = isHorizontal ? frame.width : frame.height;
  const mainPadStart = isHorizontal ? config.paddingLeft : config.paddingTop;
  const mainPadEnd = isHorizontal ? config.paddingRight : config.paddingBottom;
  const crossPadStart = isHorizontal ? config.paddingTop : config.paddingLeft;
  const crossPadEnd = isHorizontal ? config.paddingBottom : config.paddingRight;
  const mainContentSize = mainAxisFixed - mainPadStart - mainPadEnd;

  const lines: LayoutChild[][] = [];
  let currentLine: LayoutChild[] = [];
  let currentMainUsed = 0;

  for (const child of visibleChildren) {
    const eff = effectiveSize(child);
    const childMainSize = isHorizontal ? eff.width : eff.height;
    const gapBefore = currentLine.length > 0 ? config.gap : 0;

    if (currentLine.length > 0 && currentMainUsed + gapBefore + childMainSize > mainContentSize) {
      lines.push(currentLine);
      currentLine = [child];
      currentMainUsed = childMainSize;
    } else {
      currentMainUsed += gapBefore + childMainSize;
      currentLine.push(child);
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  const lineCrossSizes = lines.map((line) =>
    Math.max(
      ...line.map((c) => {
        const eff = effectiveSize(c);
        return isHorizontal ? eff.height : eff.width;
      }),
    ),
  );

  const totalCrossContent =
    lineCrossSizes.reduce((s, v) => s + v, 0) + Math.max(0, lines.length - 1) * config.gapColumn;

  let parentWidth = frame.width;
  let parentHeight = frame.height;

  if (isHorizontal) {
    if (config.sizingVertical === 'hug') {
      parentHeight = crossPadStart + totalCrossContent + crossPadEnd;
    }
  } else {
    if (config.sizingHorizontal === 'hug') {
      parentWidth = crossPadStart + totalCrossContent + crossPadEnd;
    }
  }

  let crossCursor = crossPadStart;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const lineCrossSize = lineCrossSizes[li]!;

    const resolvedLine: ResolvedChild[] = line.map((child) => {
      let w = child.width;
      let h = child.height;

      if (isHorizontal) {
        if (child.layoutSizingVertical === 'fill' || config.alignItems === 'stretch')
          h = lineCrossSize;
      } else {
        if (child.layoutSizingHorizontal === 'fill' || config.alignItems === 'stretch')
          w = lineCrossSize;
      }

      return {
        ...child,
        width: Math.max(0, clampSize(w, child.minWidth, child.maxWidth)),
        height: Math.max(0, clampSize(h, child.minHeight, child.maxHeight)),
      };
    });

    positionLine(config, resolvedLine, result, isHorizontal, mainContentSize, {
      mainStart: mainPadStart,
      crossStart: crossCursor,
      crossSize: lineCrossSize,
    });

    crossCursor += lineCrossSize + config.gapColumn;
  }

  return {
    childLayouts: result,
    parentSize: { width: parentWidth, height: parentHeight },
  };
}

function positionLine(
  config: AutoLayoutConfig,
  children: ResolvedChild[],
  result: Map<string, LayoutResult>,
  isHorizontal: boolean,
  mainAxisSpace: number,
  offsets: { mainStart: number; crossStart: number; crossSize: number },
) {
  const totalMainSize = children.reduce((sum, c) => sum + (isHorizontal ? c.width : c.height), 0);
  const totalGap = Math.max(0, children.length - 1) * config.gap;
  const freeSpace = Math.max(0, mainAxisSpace - totalMainSize - totalGap);

  let cursor: number;
  let gapOverride = config.gap;

  switch (config.justifyContent) {
    case 'start':
      cursor = offsets.mainStart;
      break;
    case 'center':
      cursor = offsets.mainStart + freeSpace / 2;
      break;
    case 'end':
      cursor = offsets.mainStart + freeSpace;
      break;
    case 'space_between':
      cursor = offsets.mainStart;
      if (children.length > 1) {
        gapOverride = (mainAxisSpace - totalMainSize) / (children.length - 1);
      }
      break;
    case 'space_around':
      if (children.length > 0) {
        const spacing = (mainAxisSpace - totalMainSize) / children.length;
        cursor = offsets.mainStart + spacing / 2;
        gapOverride = spacing;
      } else {
        cursor = offsets.mainStart;
      }
      break;
  }

  for (const child of children) {
    let x: number;
    let y: number;

    if (isHorizontal) {
      x = cursor;
      cursor += child.width + gapOverride;

      switch (config.alignItems) {
        case 'start':
        case 'stretch':
          y = offsets.crossStart;
          break;
        case 'center':
          y = offsets.crossStart + (offsets.crossSize - child.height) / 2;
          break;
        case 'end':
          y = offsets.crossStart + offsets.crossSize - child.height;
          break;
      }
    } else {
      y = cursor;
      cursor += child.height + gapOverride;

      switch (config.alignItems) {
        case 'start':
        case 'stretch':
          x = offsets.crossStart;
          break;
        case 'center':
          x = offsets.crossStart + (offsets.crossSize - child.width) / 2;
          break;
        case 'end':
          x = offsets.crossStart + offsets.crossSize - child.width;
          break;
      }
    }

    result.set(child.id, { x: x!, y: y!, width: child.width, height: child.height });
  }
}

function effectiveSize(child: LayoutChild): { width: number; height: number } {
  return {
    width: clampSize(child.width, child.minWidth, child.maxWidth),
    height: clampSize(child.height, child.minHeight, child.maxHeight),
  };
}

function computeHugSize(
  config: AutoLayoutConfig,
  children: LayoutChild[],
  isHorizontal: boolean,
): { width: number; height: number } {
  if (children.length === 0) {
    return {
      width: config.paddingLeft + config.paddingRight,
      height: config.paddingTop + config.paddingBottom,
    };
  }

  const gaps = Math.max(0, children.length - 1) * config.gap;

  if (isHorizontal) {
    const totalChildWidth = children.reduce((sum, c) => sum + effectiveSize(c).width, 0);
    const maxHeight = Math.max(...children.map((c) => effectiveSize(c).height));
    return {
      width: config.paddingLeft + totalChildWidth + gaps + config.paddingRight,
      height: config.paddingTop + maxHeight + config.paddingBottom,
    };
  }

  const totalChildHeight = children.reduce((sum, c) => sum + effectiveSize(c).height, 0);
  const maxWidth = Math.max(...children.map((c) => effectiveSize(c).width));
  return {
    width: config.paddingLeft + maxWidth + config.paddingRight,
    height: config.paddingTop + totalChildHeight + gaps + config.paddingBottom,
  };
}
