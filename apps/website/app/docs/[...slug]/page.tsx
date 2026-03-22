import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getDoc, getDocSlugs, getAdjacentDocs, VERSIONS } from '@/lib/docs';
import { DEFAULT_VERSION, parseDocSlug, docUrl } from '@/lib/docs-config';
import { renderMDX, extractHeadings } from '@/lib/mdx';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableOfContents } from '@/components/table-of-contents';

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  const params: { slug: string[] }[] = [];

  for (const version of VERSIONS) {
    const slugs = getDocSlugs(version);
    for (const docSlug of slugs) {
      if (version === DEFAULT_VERSION) {
        params.push({ slug: docSlug });
      } else {
        params.push({ slug: [version, ...docSlug] });
      }
    }
  }

  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { version, docSlug } = parseDocSlug(slug);

  const doc = getDoc(version, docSlug);
  if (!doc) return {};

  return {
    title: doc.meta.title,
    description: doc.meta.description,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const { version, docSlug } = parseDocSlug(slug);

  if (docSlug.length === 0) {
    notFound();
  }

  const doc = getDoc(version, docSlug);
  if (!doc) {
    notFound();
  }

  const { prev, next } = getAdjacentDocs(version, docSlug);
  const content = await renderMDX(doc.content);
  const headings = extractHeadings(doc.content);

  return (
    <div className="flex gap-8">
      <article className="min-w-0 flex-1 px-4 py-8 md:px-8">
        <div className="prose-headings:scroll-mt-20 [&>h1:first-child]:mt-0">{content}</div>

        <div className="mt-12 flex items-center justify-between border-t pt-6">
          {prev ? (
            <Button variant="ghost" asChild>
              <Link href={docUrl(version, prev.slug)}>
                <ChevronLeftIcon className="mr-2 size-4" />
                {prev.label}
              </Link>
            </Button>
          ) : (
            <div />
          )}
          {next ? (
            <Button variant="ghost" asChild>
              <Link href={docUrl(version, next.slug)}>
                {next.label}
                <ChevronRightIcon className="ml-2 size-4" />
              </Link>
            </Button>
          ) : (
            <div />
          )}
        </div>
      </article>

      {headings.length > 0 && (
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 pr-4 xl:block">
          <TableOfContents headings={headings} />
        </aside>
      )}
    </div>
  );
}
