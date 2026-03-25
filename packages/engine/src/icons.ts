import iconNodes from 'lucide-static/icon-nodes.json';

type IconNode = [string, Record<string, string>];
const icons = iconNodes as unknown as Record<string, IconNode[]>;

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attrsToString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXmlAttr(v)}"`)
    .join(' ');
}

export function getIconNames(): string[] {
  return Object.keys(icons);
}

export function searchIcons(query: string): string[] {
  const lower = query.toLowerCase();
  const results = Object.keys(icons).filter((name) => name.includes(lower));
  if (results.length === 0) {
    const reversed = lower.split('-').reverse().join('-');
    const reversedResults = Object.keys(icons).filter((name) => name.includes(reversed));
    if (reversedResults.length > 0) return reversedResults;
  }
  return results;
}

function resolveIconName(name: string): string | null {
  if (icons[name]) return name;

  const reversed = name.split('-').reverse().join('-');
  if (icons[reversed]) return reversed;

  return null;
}

export function getIconSvg(
  name: string,
  size = 24,
  strokeWidth = 2,
  color = '#000000',
): string | null {
  const resolved = resolveIconName(name);
  if (!resolved) return null;
  const nodes = icons[resolved]!;

  const safeSize = Math.max(1, Math.min(Number.isFinite(size) ? size : 24, 4096));
  const safeStrokeWidth = Math.max(
    0,
    Math.min(Number.isFinite(strokeWidth) ? strokeWidth : 2, 100),
  );
  const safeColor = /^[#a-zA-Z0-9(),.\s%]+$/.test(color) ? color : '#000000';

  const children = nodes
    .map(([tag, attrs]) => {
      const a = { ...attrs };
      delete a['key'];
      return `<${tag} ${attrsToString(a)}/>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` width="${safeSize}" height="${safeSize}"`,
    ` viewBox="0 0 24 24" fill="none"`,
    ` stroke="${escapeXmlAttr(safeColor)}" stroke-width="${safeStrokeWidth}"`,
    ` stroke-linecap="round" stroke-linejoin="round">`,
    children,
    `</svg>`,
  ].join('');
}
