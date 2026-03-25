export type SvgArrowheadType =
  | 'none'
  | 'line_arrow'
  | 'triangle_arrow'
  | 'reversed_triangle'
  | 'circle_arrow'
  | 'diamond_arrow';

export function buildArrowheadSvg(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  sw: number,
  strokeColor: string,
  type: SvgArrowheadType,
  cap: string = 'butt',
): string {
  if (type === 'none') return '';

  const swClamped = Math.max(sw, 1);
  const headLen = swClamped * 4 + 4;
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const halfSpread = Math.PI / 6;
  const capAttr = cap !== 'butt' ? ` stroke-linecap="${cap}"` : '';
  const joinAttr = cap === 'round' ? ' stroke-linejoin="round"' : '';
  const strokeAttrs = `stroke="${strokeColor}" stroke-width="${sw}"${capAttr}`;

  switch (type) {
    case 'line_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return `<polyline points="${lx},${ly} ${tipX},${tipY} ${rx},${ry}" fill="none" ${strokeAttrs}${joinAttr}/>`;
    }
    case 'triangle_arrow': {
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return `<polygon points="${tipX},${tipY} ${lx},${ly} ${rx},${ry}" fill="${strokeColor}" ${strokeAttrs}${joinAttr}/>`;
    }
    case 'reversed_triangle': {
      const baseX = tipX + headLen * Math.cos(angle);
      const baseY = tipY + headLen * Math.sin(angle);
      const lx = tipX - headLen * Math.cos(angle - halfSpread);
      const ly = tipY - headLen * Math.sin(angle - halfSpread);
      const rx = tipX - headLen * Math.cos(angle + halfSpread);
      const ry = tipY - headLen * Math.sin(angle + halfSpread);
      return `<polygon points="${baseX},${baseY} ${lx},${ly} ${rx},${ry}" fill="${strokeColor}" ${strokeAttrs}${joinAttr}/>`;
    }
    case 'circle_arrow': {
      const r = swClamped * 2.5 + 2;
      return `<circle cx="${tipX}" cy="${tipY}" r="${r}" fill="${strokeColor}" ${strokeAttrs}/>`;
    }
    case 'diamond_arrow': {
      const half = swClamped * 2.5 + 2;
      const cx = tipX - half * Math.cos(angle);
      const cy = tipY - half * Math.sin(angle);
      const backX = cx - half * Math.cos(angle);
      const backY = cy - half * Math.sin(angle);
      const leftX = cx - half * Math.sin(angle);
      const leftY = cy + half * Math.cos(angle);
      const rightX = cx + half * Math.sin(angle);
      const rightY = cy - half * Math.cos(angle);
      return `<polygon points="${tipX},${tipY} ${leftX},${leftY} ${backX},${backY} ${rightX},${rightY}" fill="${strokeColor}" ${strokeAttrs}${joinAttr}/>`;
    }
  }
}
