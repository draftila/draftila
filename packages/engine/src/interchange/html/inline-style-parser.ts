import { cssColorToHex, type TailwindStyle } from './tailwind-class-parser';

function cssLengthToPx(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  if (match[2] === 'rem' || match[2] === 'em') return numeric * 16;
  return numeric;
}

function applyPadding(style: TailwindStyle, value: string): void {
  const parts = value
    .trim()
    .split(/\s+/)
    .map(cssLengthToPx)
    .filter((part): part is number => part !== null);
  if (parts.length === 0) return;
  const [first, second, third, fourth] = parts;
  style.paddingTop = first!;
  style.paddingRight = second ?? first!;
  style.paddingBottom = third ?? first!;
  style.paddingLeft = fourth ?? second ?? first!;
}

export function parseInlineStyle(styleAttr: string | null): Partial<TailwindStyle> {
  if (!styleAttr) return {};
  const style: TailwindStyle = {};

  for (const declaration of styleAttr.split(';')) {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex < 0) continue;
    const property = declaration.slice(0, colonIndex).trim().toLowerCase();
    const value = declaration.slice(colonIndex + 1).trim();
    if (value.length === 0) continue;

    switch (property) {
      case 'width': {
        const px = cssLengthToPx(value);
        if (px !== null) style.width = px;
        else if (value === '100%') style.widthFull = true;
        break;
      }
      case 'height': {
        const px = cssLengthToPx(value);
        if (px !== null) style.height = px;
        else if (value === '100%') style.heightFull = true;
        break;
      }
      case 'min-width': {
        const px = cssLengthToPx(value);
        if (px !== null) style.minWidth = px;
        break;
      }
      case 'max-width': {
        const px = cssLengthToPx(value);
        if (px !== null) style.maxWidth = px;
        break;
      }
      case 'min-height': {
        const px = cssLengthToPx(value);
        if (px !== null) style.minHeight = px;
        break;
      }
      case 'max-height': {
        const px = cssLengthToPx(value);
        if (px !== null) style.maxHeight = px;
        break;
      }
      case 'background-color':
      case 'background': {
        const color = cssColorToHex(value);
        if (color) style.backgroundColor = color;
        break;
      }
      case 'color': {
        const color = cssColorToHex(value);
        if (color && color !== 'transparent') style.textColor = color;
        break;
      }
      case 'border-radius': {
        const px = cssLengthToPx(value);
        if (px !== null) style.cornerRadius = px;
        break;
      }
      case 'padding':
        applyPadding(style, value);
        break;
      case 'padding-top': {
        const px = cssLengthToPx(value);
        if (px !== null) style.paddingTop = px;
        break;
      }
      case 'padding-right': {
        const px = cssLengthToPx(value);
        if (px !== null) style.paddingRight = px;
        break;
      }
      case 'padding-bottom': {
        const px = cssLengthToPx(value);
        if (px !== null) style.paddingBottom = px;
        break;
      }
      case 'padding-left': {
        const px = cssLengthToPx(value);
        if (px !== null) style.paddingLeft = px;
        break;
      }
      case 'gap': {
        const px = cssLengthToPx(value);
        if (px !== null) style.gap = px;
        break;
      }
      case 'font-size': {
        const px = cssLengthToPx(value);
        if (px !== null) style.fontSize = px;
        break;
      }
      case 'font-weight': {
        const weight = Number(value);
        if (Number.isFinite(weight)) style.fontWeight = weight;
        else if (value === 'bold') style.fontWeight = 700;
        break;
      }
      case 'font-style':
        if (value === 'italic') style.fontItalic = true;
        break;
      case 'font-family':
        style.fontFamily = value
          .split(',')[0]!
          .trim()
          .replace(/^['"]|['"]$/g, '');
        break;
      case 'text-align':
        if (value === 'left' || value === 'center' || value === 'right') style.textAlign = value;
        break;
      case 'line-height': {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) style.lineHeight = numeric;
        break;
      }
      case 'letter-spacing': {
        const px = cssLengthToPx(value);
        if (px !== null) style.letterSpacing = px;
        break;
      }
      case 'display':
        if (value === 'flex' || value === 'inline-flex') style.display = 'flex';
        else if (value === 'none') style.hidden = true;
        break;
      case 'flex-direction':
        if (value.startsWith('row')) style.flexDirection = 'row';
        else if (value.startsWith('column')) style.flexDirection = 'col';
        break;
      case 'align-items':
        if (value === 'flex-start' || value === 'start') style.alignItems = 'start';
        else if (value === 'center') style.alignItems = 'center';
        else if (value === 'flex-end' || value === 'end') style.alignItems = 'end';
        else if (value === 'stretch') style.alignItems = 'stretch';
        break;
      case 'justify-content':
        if (value === 'flex-start' || value === 'start') style.justifyContent = 'start';
        else if (value === 'center') style.justifyContent = 'center';
        else if (value === 'flex-end' || value === 'end') style.justifyContent = 'end';
        else if (value === 'space-between') style.justifyContent = 'space_between';
        else if (value === 'space-around') style.justifyContent = 'space_around';
        break;
      case 'opacity': {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) style.opacity = Math.max(0, Math.min(1, numeric));
        break;
      }
      case 'overflow':
        if (value === 'hidden') style.clip = true;
        else if (value === 'visible') style.clip = false;
        break;
    }
  }

  return style;
}
