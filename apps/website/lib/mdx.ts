import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { remarkCallout } from './remark-callout';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrettyCode, { type Options } from 'rehype-pretty-code';
import {
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from '@shikijs/transformers';
import { type ReactNode } from 'react';
import { mdxComponents } from '@/components/mdx-components';

export interface TocEntry {
  depth: number;
  text: string;
  id: string;
}

export function extractHeadings(source: string): TocEntry[] {
  const headings: TocEntry[] = [];
  const lines = source.split('\n');

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const depth = match[1]!.length;
      const rawText = match[2]!
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .trim();

      const id = rawText
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      headings.push({ depth, text: rawText, id });
    }
  }

  return headings;
}

export async function renderMDX(source: string): Promise<ReactNode> {
  const { content } = await compileMDX({
    source,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm, remarkDirective, remarkCallout],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: 'wrap',
              properties: {
                className: ['anchor'],
              },
            },
          ],
          [
            rehypePrettyCode as never,
            {
              theme: {
                dark: 'vesper',
                light: 'github-light-default',
              },
              keepBackground: false,
              transformers: [transformerNotationHighlight(), transformerNotationWordHighlight()],
              onVisitLine(node: { properties: { className?: string[] } }) {
                if (node.properties.className === undefined) {
                  node.properties.className = [];
                }
              },
            } satisfies Options,
          ],
        ],
      },
    },
  });

  return content;
}
