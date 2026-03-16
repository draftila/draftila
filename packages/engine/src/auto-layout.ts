export type LayoutDirection = 'horizontal' | 'vertical';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';
export type SizingMode = 'fixed' | 'hug' | 'fill';

export interface AutoLayoutConfig {
  direction: LayoutDirection;
  gap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  alignItems: LayoutAlign;
  justifyContent: LayoutAlign;
}

export const DEFAULT_AUTO_LAYOUT: AutoLayoutConfig = {
  direction: 'vertical',
  gap: 8,
  paddingTop: 8,
  paddingRight: 8,
  paddingBottom: 8,
  paddingLeft: 8,
  alignItems: 'start',
  justifyContent: 'start',
};

interface LayoutChild {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sizingMode?: { horizontal: SizingMode; vertical: SizingMode };
}

export function computeAutoLayout(
  config: AutoLayoutConfig,
  parentWidth: number,
  parentHeight: number,
  children: LayoutChild[],
): Map<string, { x: number; y: number; width: number; height: number }> {
  const result = new Map<string, { x: number; y: number; width: number; height: number }>();

  const contentStartX = config.paddingLeft;
  const contentStartY = config.paddingTop;
  const contentWidth = parentWidth - config.paddingLeft - config.paddingRight;
  const contentHeight = parentHeight - config.paddingTop - config.paddingBottom;

  let cursor = config.direction === 'horizontal' ? contentStartX : contentStartY;

  for (const child of children) {
    let x = contentStartX;
    let y = contentStartY;
    let width = child.width;
    let height = child.height;

    if (config.direction === 'horizontal') {
      x = cursor;
      cursor += width + config.gap;

      switch (config.alignItems) {
        case 'start':
          y = contentStartY;
          break;
        case 'center':
          y = contentStartY + (contentHeight - height) / 2;
          break;
        case 'end':
          y = contentStartY + contentHeight - height;
          break;
        case 'stretch':
          y = contentStartY;
          height = contentHeight;
          break;
      }
    } else {
      y = cursor;
      cursor += height + config.gap;

      switch (config.alignItems) {
        case 'start':
          x = contentStartX;
          break;
        case 'center':
          x = contentStartX + (contentWidth - width) / 2;
          break;
        case 'end':
          x = contentStartX + contentWidth - width;
          break;
        case 'stretch':
          x = contentStartX;
          width = contentWidth;
          break;
      }
    }

    if (child.sizingMode?.horizontal === 'fill' && config.direction === 'vertical') {
      width = contentWidth;
      x = contentStartX;
    }
    if (child.sizingMode?.vertical === 'fill' && config.direction === 'horizontal') {
      height = contentHeight;
      y = contentStartY;
    }

    result.set(child.id, { x, y, width, height });
  }

  return result;
}

export function computeHugSize(
  config: AutoLayoutConfig,
  children: LayoutChild[],
): { width: number; height: number } {
  if (children.length === 0) {
    return {
      width: config.paddingLeft + config.paddingRight,
      height: config.paddingTop + config.paddingBottom,
    };
  }

  if (config.direction === 'horizontal') {
    const totalChildWidth = children.reduce((sum, c) => sum + c.width, 0);
    const gaps = (children.length - 1) * config.gap;
    const maxHeight = Math.max(...children.map((c) => c.height));

    return {
      width: config.paddingLeft + totalChildWidth + gaps + config.paddingRight,
      height: config.paddingTop + maxHeight + config.paddingBottom,
    };
  }

  const totalChildHeight = children.reduce((sum, c) => sum + c.height, 0);
  const gaps = (children.length - 1) * config.gap;
  const maxWidth = Math.max(...children.map((c) => c.width));

  return {
    width: config.paddingLeft + maxWidth + config.paddingRight,
    height: config.paddingTop + totalChildHeight + gaps + config.paddingBottom,
  };
}
