'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  VERSIONS,
  DEFAULT_VERSION,
  VERSION_LABELS,
  type SidebarItem,
  type Version,
  docUrl,
} from '@/lib/docs-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

function SidebarCategory({
  item,
  version,
  pathname,
}: {
  item: SidebarItem;
  version: Version;
  pathname: string;
}) {
  return (
    <div>
      <div className="text-foreground px-2 py-1.5 text-sm font-medium">{item.label}</div>
      {item.items && (
        <div className="ml-3 space-y-0.5 border-l pl-2">
          {item.items.map((child) => (
            <SidebarItemComponent
              key={child.id || child.label}
              item={child}
              version={version}
              pathname={pathname}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarDocLink({
  item,
  version,
  pathname,
}: {
  item: SidebarItem;
  version: Version;
  pathname: string;
}) {
  const href = item.id ? docUrl(version, item.id) : '#';
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'block rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {item.label}
    </Link>
  );
}

function SidebarItemComponent({
  item,
  version,
  pathname,
}: {
  item: SidebarItem;
  version: Version;
  pathname: string;
}) {
  if (item.type === 'category') {
    return <SidebarCategory item={item} version={version} pathname={pathname} />;
  }
  return <SidebarDocLink item={item} version={version} pathname={pathname} />;
}

export function DocsSidebar({ items, version }: { items: SidebarItem[]; version: Version }) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleLinkClick = useCallback(() => {
    if (scrollRef.current) {
      sessionStorage.setItem('docs-sidebar-scroll', String(scrollRef.current.scrollTop));
    }
  }, []);

  const restoreScroll = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      scrollRef.current = node;
      const saved = sessionStorage.getItem('docs-sidebar-scroll');
      if (saved) {
        node.scrollTop = Number(saved);
      }
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      el.classList.add('is-scrolling');
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        el.classList.remove('is-scrolling');
      }, 1000);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div ref={restoreScroll} className="h-[calc(100vh-3.5rem)] overflow-y-auto py-4 pr-4">
      {VERSIONS.length > 1 && (
        <div className="mb-3 pl-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-full justify-between">
                {VERSION_LABELS[version] || `v${version}`}
                {version === DEFAULT_VERSION && ' (latest)'}
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              {VERSIONS.map((v) => (
                <DropdownMenuItem key={v} asChild>
                  <Link
                    href={docUrl(v, 'getting-started/introduction')}
                    className={cn(v === version && 'font-medium')}
                  >
                    {VERSION_LABELS[v] || `v${v}`}
                    {v === DEFAULT_VERSION && ' (latest)'}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div role="presentation" className="space-y-2" onClick={handleLinkClick}>
        {items
          .filter((item) => item.type === 'category')
          .map((item) => (
            <SidebarItemComponent
              key={item.id || item.label}
              item={item}
              version={version}
              pathname={pathname}
            />
          ))}
        {items.some((item) => item.type === 'doc') && (
          <SidebarCategory
            item={{
              type: 'category',
              label: 'Other',
              items: items.filter((item) => item.type === 'doc'),
            }}
            version={version}
            pathname={pathname}
          />
        )}
      </div>
    </div>
  );
}
