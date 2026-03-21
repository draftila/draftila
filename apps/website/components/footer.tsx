import Link from 'next/link';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';

const footerLinks = {
  product: {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Documentation', href: '/docs' },
    ],
  },
  community: {
    title: 'Community',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/draftila/draftila',
        external: true,
      },
      {
        label: 'Discussions',
        href: 'https://github.com/draftila/draftila/discussions',
        external: true,
      },
    ],
  },
  more: {
    title: 'More',
    links: [
      {
        label: 'Sponsor',
        href: 'https://github.com/sponsors/saeedvaziry',
        external: true,
      },
    ],
  },
};

export function Footer() {
  return (
    <footer className="bg-background border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/img/logo.svg"
                alt="Draftila"
                width={24}
                height={24}
                className="rounded"
              />
              <span className="font-semibold">Draftila</span>
            </Link>
            <p className="text-muted-foreground mt-3 text-sm">
              Free, open-source, self-hosted design tool.
            </p>
          </div>

          {Object.values(footerLinks).map((section) => (
            <div key={section.title}>
              <h4 className="mb-3 text-sm font-semibold">{section.title}</h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {'external' in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <p className="text-muted-foreground text-center text-sm">
          &copy; {new Date().getFullYear()} Draftila. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
