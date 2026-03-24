import iconNodes from 'lucide-static/icon-nodes.json';

type IconNode = [string, Record<string, string>];
const icons = iconNodes as unknown as Record<string, IconNode[]>;

function attrsToString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

export function getIconNames(): string[] {
  return Object.keys(icons);
}

export function searchIcons(query: string): string[] {
  const lower = query.toLowerCase();
  return Object.keys(icons).filter((name) => name.includes(lower));
}

export function getIconSvg(
  name: string,
  size = 24,
  strokeWidth = 2,
  color = '#000000',
): string | null {
  const nodes = icons[name];
  if (!nodes) return null;

  const children = nodes
    .map(([tag, attrs]) => {
      const a = { ...attrs };
      delete a['key'];
      return `<${tag} ${attrsToString(a)}/>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` width="${size}" height="${size}"`,
    ` viewBox="0 0 24 24" fill="none"`,
    ` stroke="${color}" stroke-width="${strokeWidth}"`,
    ` stroke-linecap="round" stroke-linejoin="round">`,
    children,
    `</svg>`,
  ].join('');
}
