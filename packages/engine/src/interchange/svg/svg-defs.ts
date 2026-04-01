import type {
  InterchangeShadow,
  InterchangeBlur,
  InterchangeGradient,
} from '../interchange-format';
import { parseHexAlpha, svgColor } from './svg-gen-utils';

export function buildDropShadowFilter(
  shadows: InterchangeShadow[],
  blurs: InterchangeBlur[],
  filterId: string,
): string | null {
  const dropShadows = shadows.filter((s) => s.type === 'drop' && s.visible);
  const layerBlur = blurs.find((b) => b.type === 'layer' && b.visible);

  if (dropShadows.length === 0 && !layerBlur) return null;

  const parts: string[] = [
    `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">`,
  ];

  if (layerBlur && layerBlur.radius > 0) {
    parts.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${layerBlur.radius}"/>`);
  }

  for (const shadow of dropShadows) {
    const { r, g, b, a } = parseHexAlpha(shadow.color);
    parts.push(
      `<feDropShadow dx="${shadow.x}" dy="${shadow.y}" stdDeviation="${shadow.blur / 2}" flood-color="rgb(${r},${g},${b})" flood-opacity="${a}"/>`,
    );
  }

  parts.push('</filter>');
  return parts.join('');
}

export function buildInnerShadowFilter(
  shadows: InterchangeShadow[],
  filterId: string,
): string | null {
  const innerShadows = shadows.filter((s) => s.type === 'inner' && s.visible);
  if (innerShadows.length === 0) return null;

  const parts: string[] = [
    `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">`,
    '<feComponentTransfer in="SourceAlpha"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>',
  ];

  for (const shadow of innerShadows) {
    const { r, g, b, a } = parseHexAlpha(shadow.color);
    parts.push(
      `<feGaussianBlur stdDeviation="${shadow.blur / 2}"/>`,
      `<feOffset dx="${shadow.x}" dy="${shadow.y}" result="offsetblur"/>`,
      `<feFlood flood-color="rgb(${r},${g},${b})" flood-opacity="${a}" result="color"/>`,
      '<feComposite in2="offsetblur" operator="in"/>',
      '<feComposite in2="SourceAlpha" operator="in"/>',
    );
  }

  parts.push('<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge>', '</filter>');
  return parts.join('');
}

export function buildGradientDef(gradient: InterchangeGradient, gradId: string): string {
  if (gradient.type === 'linear') {
    const angleRad = ((gradient.angle ?? 0) * Math.PI) / 180;
    const x1 = 0.5 - Math.cos(angleRad) * 0.5;
    const y1 = 0.5 - Math.sin(angleRad) * 0.5;
    const x2 = 0.5 + Math.cos(angleRad) * 0.5;
    const y2 = 0.5 + Math.sin(angleRad) * 0.5;

    const stops = gradient.stops
      .map((s) => `<stop offset="${s.position}" stop-color="${svgColor(s.color, 1)}"/>`)
      .join('');
    return `<linearGradient id="${gradId}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
  }

  const stops = gradient.stops
    .map((s) => `<stop offset="${s.position}" stop-color="${s.color}"/>`)
    .join('');
  return `<radialGradient id="${gradId}" cx="${gradient.cx ?? 0.5}" cy="${gradient.cy ?? 0.5}" r="${gradient.r ?? 0.5}">${stops}</radialGradient>`;
}
