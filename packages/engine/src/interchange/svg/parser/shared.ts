import { parseLength } from '../css';

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
  const match = value.match(/url\(["']?#([^)"']+)["']?\)/);
  return match?.[1] ?? null;
}

export function parseBlendMode(el: Element): string {
  const style = el.getAttribute('style');
  if (style) {
    const match = style.match(/mix-blend-mode:\s*([^;]+)/i);
    if (match) {
      const mode = match[1]!.trim().toLowerCase();
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
  }
  return 'normal';
}
