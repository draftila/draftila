import { Geist, Geist_Mono } from 'next/font/google';
import type { Metadata } from 'next';

import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { cn } from '@/lib/utils';

const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
});

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://draftila.com'),
  title: {
    default: 'Draftila — Open-Source, Self-Hosted Design Tool',
    template: '%s | Draftila',
  },
  description:
    'A free, open-source, and self-hosted design tool. The lightweight alternative to Figma that you can run on your own server.',
  openGraph: {
    title: 'Draftila',
    description: 'Free, open-source, self-hosted design tool. A lightweight alternative to Figma.',
    url: 'https://draftila.com',
    siteName: 'Draftila',
    type: 'website',
    images: [{ url: '/img/draftila.jpg', width: 1200, height: 750, alt: 'Draftila Editor' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Draftila — Open-Source, Self-Hosted Design Tool',
    description: 'Free, open-source, self-hosted design tool. A lightweight alternative to Figma.',
    images: ['/img/draftila.jpg'],
  },
  icons: {
    icon: { url: '/favicon.svg', type: 'image/svg+xml' },
  },
  alternates: {
    canonical: 'https://draftila.com',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('antialiased', fontMono.variable, 'font-sans', fontSans.variable)}
    >
      <body>
        <ThemeProvider>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
