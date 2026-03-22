export const VERSIONS = ['0.x'] as const;
export const DEFAULT_VERSION = '0.x';

export const VERSION_LABELS: Partial<Record<Version, string>> = {};

export type Version = (typeof VERSIONS)[number];

export interface SidebarItem {
  type: 'category' | 'doc';
  label: string;
  id?: string;
  items?: SidebarItem[];
}

export function docUrl(version: Version, slug: string): string {
  if (version === DEFAULT_VERSION) {
    return `/docs/${slug}`;
  }
  return `/docs/${version}/${slug}`;
}

export function parseDocSlug(slugParts: string[]): {
  version: Version;
  docSlug: string[];
} {
  const first = slugParts[0];
  if (first && VERSIONS.includes(first as Version) && first !== DEFAULT_VERSION) {
    return { version: first as Version, docSlug: slugParts.slice(1) };
  }
  if (first === DEFAULT_VERSION) {
    return { version: DEFAULT_VERSION, docSlug: slugParts.slice(1) };
  }
  return { version: DEFAULT_VERSION, docSlug: slugParts };
}
