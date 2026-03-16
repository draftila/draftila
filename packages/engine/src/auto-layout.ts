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
}

export interface LayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isAutoLayoutFrame(shape: Shape): shape is FrameShape {
  return shape.type === 'frame' && (shape as FrameShape).layoutMode !== 'none';
}

export function getAutoLayoutConfig(frame: FrameShape) {
  return {
    direction: frame.layoutMode as 'horizontal' | 'vertical',
    gap: frame.layoutGap ?? 0,
    paddingTop: frame.paddingTop ?? 0,
    paddingRight: frame.paddingRight ?? 0,
    paddingBottom: frame.paddingBottom ?? 0,
    paddingLeft: frame.paddingLeft ?? 0,
    alignItems: (frame.layoutAlign ?? 'start') as 'start' | 'center' | 'end' | 'stretch',
    justifyContent: (frame.layoutJustify ?? 'start') as
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

    return { ...child, width: Math.max(0, w), height: Math.max(0, h) };
  });

  const totalMainSize = resolvedSizes.reduce(
    (sum, c) => sum + (isHorizontal ? c.width : c.height),
    0,
  );
  const totalUsed = totalMainSize + totalGap;
  const freeSpace = Math.max(0, mainAxisSpace - totalUsed);

  let cursor: number;
  let gapOverride = config.gap;

  switch (config.justifyContent) {
    case 'start':
      cursor = isHorizontal ? config.paddingLeft : config.paddingTop;
      break;
    case 'center':
      cursor = (isHorizontal ? config.paddingLeft : config.paddingTop) + freeSpace / 2;
      break;
    case 'end':
      cursor = (isHorizontal ? config.paddingLeft : config.paddingTop) + freeSpace;
      break;
    case 'space_between':
      cursor = isHorizontal ? config.paddingLeft : config.paddingTop;
      if (resolvedSizes.length > 1) {
        gapOverride = (mainAxisSpace - totalMainSize) / (resolvedSizes.length - 1);
      }
      break;
    case 'space_around':
      if (resolvedSizes.length > 0) {
        const spacing = (mainAxisSpace - totalMainSize) / resolvedSizes.length;
        cursor = (isHorizontal ? config.paddingLeft : config.paddingTop) + spacing / 2;
        gapOverride = spacing;
      } else {
        cursor = isHorizontal ? config.paddingLeft : config.paddingTop;
      }
      break;
  }

  for (const child of resolvedSizes) {
    let x: number;
    let y: number;

    if (isHorizontal) {
      x = cursor;
      cursor += child.width + gapOverride;

      switch (config.alignItems) {
        case 'start':
        case 'stretch':
          y = config.paddingTop;
          break;
        case 'center':
          y = config.paddingTop + (contentHeight - child.height) / 2;
          break;
        case 'end':
          y = config.paddingTop + contentHeight - child.height;
          break;
      }
    } else {
      y = cursor;
      cursor += child.height + gapOverride;

      switch (config.alignItems) {
        case 'start':
        case 'stretch':
          x = config.paddingLeft;
          break;
        case 'center':
          x = config.paddingLeft + (contentWidth - child.width) / 2;
          break;
        case 'end':
          x = config.paddingLeft + contentWidth - child.width;
          break;
      }
    }

    result.set(child.id, { x: x!, y: y!, width: child.width, height: child.height });
  }

  return {
    childLayouts: result,
    parentSize: { width: parentWidth, height: parentHeight },
  };
}

function computeHugSize(
  config: ReturnType<typeof getAutoLayoutConfig>,
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
    const totalChildWidth = children.reduce((sum, c) => sum + c.width, 0);
    const maxHeight = Math.max(...children.map((c) => c.height));
    return {
      width: config.paddingLeft + totalChildWidth + gaps + config.paddingRight,
      height: config.paddingTop + maxHeight + config.paddingBottom,
    };
  }

  const totalChildHeight = children.reduce((sum, c) => sum + c.height, 0);
  const maxWidth = Math.max(...children.map((c) => c.width));
  return {
    width: config.paddingLeft + maxWidth + config.paddingRight,
    height: config.paddingTop + totalChildHeight + gaps + config.paddingBottom,
  };
}
