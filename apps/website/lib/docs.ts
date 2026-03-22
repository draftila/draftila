import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export { VERSIONS, DEFAULT_VERSION } from './docs-config';
export type { Version, SidebarItem } from './docs-config';
import type { Version, SidebarItem } from './docs-config';

export interface DocMeta {
  title: string;
  slug: string;
  version: Version;
  description?: string;
  sidebar_label?: string;
}

export interface DocPage {
  meta: DocMeta;
  content: string;
  slugParts: string[];
}

const CONTENT_DIR = path.join(process.cwd(), 'content/docs');

function titleFromId(id: string): string {
  const lastPart = id.split('/').pop() || id;
  return lastPart
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function getSidebar(version: Version): SidebarItem[] {
  const sidebars: Record<Version, SidebarItem[]> = {
    '0.x': [
      {
        type: 'category',
        label: 'Getting Started',
        items: [
          { type: 'doc', label: 'Introduction', id: 'getting-started/introduction' },
          { type: 'doc', label: 'Installation', id: 'getting-started/installation' },
          { type: 'doc', label: 'Configuration', id: 'getting-started/configuration' },
          { type: 'doc', label: 'Update', id: 'getting-started/update' },
        ],
      },
      {
        type: 'category',
        label: 'Contributing',
        items: [
          { type: 'doc', label: 'Contributing', id: 'contributing/contributing' },
          { type: 'doc', label: 'Development Setup', id: 'contributing/development-setup' },
        ],
      },
    ],
  };

  return sidebars[version];
}

export function getDocSlugs(version: Version): string[][] {
  const sidebar = getSidebar(version);
  const slugs: string[][] = [];

  function traverse(items: SidebarItem[]) {
    for (const item of items) {
      if (item.type === 'doc' && item.id) {
        slugs.push(item.id.split('/'));
      }
      if (item.items) {
        traverse(item.items);
      }
    }
  }

  traverse(sidebar);
  return slugs;
}

export function getDoc(version: Version, slugParts: string[]): DocPage | null {
  const docId = slugParts.join('/');
  const versionDir = path.join(CONTENT_DIR, version);

  const extensions = ['.mdx', '.md'];
  let filePath: string | null = null;
  let rawContent: string | null = null;

  for (const ext of extensions) {
    const candidate = path.join(versionDir, docId + ext);
    if (fs.existsSync(candidate)) {
      filePath = candidate;
      rawContent = fs.readFileSync(candidate, 'utf-8');
      break;
    }
  }

  if (!filePath || !rawContent) return null;

  const { data, content } = matter(rawContent);

  const sidebar = getSidebar(version);
  let label = data.title || data.sidebar_label || titleFromId(docId);

  function findLabel(items: SidebarItem[]): string | null {
    for (const item of items) {
      if (item.type === 'doc' && item.id === docId) {
        return item.label || null;
      }
      if (item.items) {
        const found = findLabel(item.items);
        if (found) return found;
      }
    }
    return null;
  }

  const sidebarLabel = findLabel(sidebar);
  if (!label && sidebarLabel) label = sidebarLabel;

  return {
    meta: {
      title: data.title || label || titleFromId(docId),
      slug: docId,
      version,
      description: data.description,
      sidebar_label: data.sidebar_label,
    },
    content,
    slugParts,
  };
}

export function getAdjacentDocs(
  version: Version,
  slugParts: string[],
): {
  prev: { label: string; slug: string } | null;
  next: { label: string; slug: string } | null;
} {
  const currentId = slugParts.join('/');
  const allSlugs = getDocSlugs(version);
  const allIds = allSlugs.map((s) => s.join('/'));
  const currentIndex = allIds.indexOf(currentId);

  const sidebar = getSidebar(version);

  function findLabel(items: SidebarItem[], id: string): string {
    for (const item of items) {
      if (item.type === 'doc' && item.id === id) {
        return item.label || titleFromId(id);
      }
      if (item.items) {
        const found = findLabel(item.items, id);
        if (found) return found;
      }
    }
    return titleFromId(id);
  }

  return {
    prev:
      currentIndex > 0
        ? {
            label: findLabel(sidebar, allIds[currentIndex - 1]!),
            slug: allIds[currentIndex - 1]!,
          }
        : null,
    next:
      currentIndex < allIds.length - 1
        ? {
            label: findLabel(sidebar, allIds[currentIndex + 1]!),
            slug: allIds[currentIndex + 1]!,
          }
        : null,
  };
}
