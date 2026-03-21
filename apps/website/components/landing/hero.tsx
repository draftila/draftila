'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { BookOpenIcon, GithubIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'motion/react';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="grid-pattern pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="noise-overlay pointer-events-none absolute inset-0 -z-10" />

      <div className="container mx-auto px-4 pb-16 pt-20 md:pb-24 md:pt-32">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge
              variant="secondary"
              className="mb-6 border-pink-200/50 bg-pink-50/50 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300"
            >
              Open-Source &middot; Self-Hosted &middot; Free
            </Badge>
          </motion.div>

          <motion.h1
            className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            The open-source
            <br />
            <span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent dark:from-pink-400 dark:to-violet-400">
              Design Tool
            </span>
          </motion.h1>

          <motion.p
            className="text-muted-foreground mt-6 max-w-xl text-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            A free, lightweight, and self-hosted design tool you can run on your own server.
            Real-time collaboration, vector editing, and everything you need — without vendor
            lock-in.
          </motion.p>

          <motion.div
            className="mt-8 flex items-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button size="lg" asChild>
              <Link href="/docs">
                <BookOpenIcon className="size-4" />
                Documentation
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a
                href="https://github.com/draftila/draftila"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon className="size-4" />
                GitHub
              </a>
            </Button>
          </motion.div>
        </div>

        {/* Screenshot placeholder */}
        <motion.div
          className="relative mx-auto mt-16 max-w-5xl"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <div className="bg-card shadow-primary/5 overflow-hidden rounded-xl border shadow-2xl">
            <Image
              src="/img/draftila.jpg"
              alt="Draftila Editor"
              width={1200}
              height={750}
              className="w-full"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
