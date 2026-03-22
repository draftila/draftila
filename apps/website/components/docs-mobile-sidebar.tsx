'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MenuIcon } from 'lucide-react';
import { DocsSidebar } from '@/components/docs-sidebar';
import type { SidebarItem, Version } from '@/lib/docs-config';

export function DocsMobileSidebar({ items, version }: { items: SidebarItem[]; version: Version }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="lg:hidden">
          <MenuIcon className="mr-2 size-4" />
          Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Documentation</SheetTitle>
        </SheetHeader>
        <div role="presentation" onClick={() => setOpen(false)}>
          <DocsSidebar items={items} version={version} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
