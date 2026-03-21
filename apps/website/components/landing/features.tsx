'use client';

import {
  BrushIcon,
  LayoutGridIcon,
  MousePointerClickIcon,
  PenToolIcon,
  ShapesIcon,
  TypeIcon,
  UsersIcon,
  LayersIcon,
  UndoIcon,
  ImageIcon,
  FrameIcon,
  StarIcon,
  MoveIcon,
  GridIcon,
  CopyIcon,
  DownloadIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const features: { title: string; description: string; icon: ReactNode }[] = [
  {
    title: 'Real-Time Collaboration',
    description: 'Work together with your team simultaneously with live cursors and changes',
    icon: <UsersIcon className="size-5" />,
  },
  {
    title: 'Vector Shapes',
    description: 'Rectangles, ellipses, polygons, stars and custom paths',
    icon: <ShapesIcon className="size-5" />,
  },
  {
    title: 'Pen Tool',
    description: 'Draw freeform paths and vector shapes with precision',
    icon: <PenToolIcon className="size-5" />,
  },
  {
    title: 'Text Editing',
    description: 'Rich text with fonts, styles, and alignment options',
    icon: <TypeIcon className="size-5" />,
  },
  {
    title: 'Frames & Layout',
    description: 'Auto-layout frames for responsive design',
    icon: <FrameIcon className="size-5" />,
  },
  {
    title: 'Layers Panel',
    description: 'Organize your design with a hierarchical layer structure',
    icon: <LayersIcon className="size-5" />,
  },
  {
    title: 'Selection & Move',
    description: 'Select, move, resize, and rotate objects with ease',
    icon: <MoveIcon className="size-5" />,
  },
  {
    title: 'Smart Snapping',
    description: 'Alignment guides and snap-to-grid for pixel-perfect designs',
    icon: <GridIcon className="size-5" />,
  },
  {
    title: 'History & Undo',
    description: 'Full undo/redo history with keyboard shortcuts',
    icon: <UndoIcon className="size-5" />,
  },
  {
    title: 'Image Support',
    description: 'Import and manipulate images within your designs',
    icon: <ImageIcon className="size-5" />,
  },
  {
    title: 'Components',
    description: 'Create reusable components across your designs',
    icon: <CopyIcon className="size-5" />,
  },
  {
    title: 'Boolean Operations',
    description: 'Union, subtract, intersect, and exclude shapes',
    icon: <BrushIcon className="size-5" />,
  },
  {
    title: 'Constraints',
    description: 'Pin elements to edges for responsive behavior',
    icon: <LayoutGridIcon className="size-5" />,
  },
  {
    title: 'Pages',
    description: 'Organize your project across multiple pages',
    icon: <MousePointerClickIcon className="size-5" />,
  },
  {
    title: 'Figma Clipboard',
    description: 'Paste Figma elements directly into Draftila',
    icon: <StarIcon className="size-5" />,
  },
  {
    title: 'Export',
    description: 'Export designs as PNG, SVG, and more',
    icon: <DownloadIcon className="size-5" />,
  },
];

export function Features() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="features" className="relative border-t py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent dark:from-pink-400 dark:to-violet-400">
              own your design workflow
            </span>
          </h2>
          <p className="text-muted-foreground mt-4">
            A lightweight, self-hosted design tool with real-time collaboration, vector editing,
            auto-layout, and more — no subscriptions, no vendor lock-in.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={cn(
                'bg-card/80 group relative overflow-hidden rounded-xl border p-5 backdrop-blur-sm transition-all duration-500',
                'hover:shadow-primary/5 hover:border-pink-300/50 hover:shadow-lg',
                'dark:hover:shadow-primary/10 dark:hover:border-pink-500/30',
                isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
              )}
              style={{
                transitionDelay: isVisible ? `${i * 50}ms` : '0ms',
              }}
            >
              <div className="relative">
                <div className="group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-primary/25 dark:group-hover:bg-primary dark:group-hover:text-primary-foreground flex size-10 items-center justify-center rounded-lg bg-pink-50 text-pink-600 transition-all duration-300 group-hover:shadow-md dark:bg-pink-500/10 dark:text-pink-400">
                  {feature.icon}
                </div>
                <h3 className="mt-3 font-medium">{feature.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
