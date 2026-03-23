import { parseLength } from '../css';

function parseStyleDeclaration(style: string | null): Map<string, string> {
  const declarations = new Map<string, string>();
  if (!style) return declarations;

  for (const part of style.split(';')) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;
    const key = part.slice(0, colonIndex).trim().toLowerCase();
    const value = part.slice(colonIndex + 1).trim();
    if (!key || !value) continue;
    declarations.set(key, value);
  }

  return declarations;
}

export function parseAttr(el: Element, attr: string, fallback = 0): number {
  return parseLength(el.getAttribute(attr), fallback);
}

export function resolveHref(el: Element): string {
  return (
    el.getAttribute('href') ??
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href') ??
    ''
  );
}

export function resolveUrlRef(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/url\(["']?#([^ )"']+)["']?\)/);
  return match?.[1] ?? null;
}

export function getPresentationAttr(el: Element, attr: string): string | null {
  const direct = el.getAttribute(attr);
  if (direct !== null) return direct;
  const style = parseStyleDeclaration(el.getAttribute('style'));
  return style.get(attr.toLowerCase()) ?? null;
}

export function parseBlendMode(el: Element): string {
  const mode = getPresentationAttr(el, 'mix-blend-mode')?.trim().toLowerCase();
  if (!mode) return 'normal';

  const modeMap: Record<string, string> = {
    normal: 'normal',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    'hard-light': 'hard-light',
    'soft-light': 'soft-light',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity',
  };

  return modeMap[mode] ?? 'normal';
}
