import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation',
  alternates: {
    canonical: '/docs/getting-started/introduction',
  },
};

export default function DocsIndex() {
  return <meta httpEquiv="refresh" content="0;url=/docs/getting-started/introduction" />;
}
