import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
import {
  ALL_FONTS,
  loadFontPreviews,
  ensureFontsLoaded,
  isFontPreviewReady,
  subscribePreviewLoads,
} from '@draftila/engine';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ITEM_HEIGHT = 32;
const VISIBLE_HEIGHT = 280;
const CACHE_KEY = 'draftila:loaded-font-previews';

function persistLoadedFonts(): void {
  try {
    const loaded = ALL_FONTS.filter((f) => isFontPreviewReady(f.family)).map((f) => f.family);
    localStorage.setItem(CACHE_KEY, JSON.stringify(loaded));
  } catch {
    // quota exceeded or private browsing
  }
}

function restoreCachedFonts(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const families = JSON.parse(raw) as string[];
    if (families.length > 0) {
      loadFontPreviews(families);
    }
  } catch {
    // invalid cache
  }
}

let cacheRestored = false;

export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(value);
  const [, setPreviewTick] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribePreviewLoads(() => {
      setPreviewTick((t) => t + 1);
      persistLoadedFonts();
    });
  }, []);

  useEffect(() => {
    if (!cacheRestored) {
      cacheRestored = true;
      restoreCachedFonts();
    }
  }, []);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!search) return ALL_FONTS;
    const lower = search.toLowerCase();
    return ALL_FONTS.filter((f) => f.family.toLowerCase().includes(lower));
  }, [search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollNode,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!open || virtualItems.length === 0) return;
    const families = virtualItems.map((item) => filtered[item.index]!.family);
    loadFontPreviews(families);
  }, [virtualItems, filtered, open]);

  const scrollRefCallback = useCallback((node: HTMLDivElement | null) => {
    setScrollNode(node);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setSearch('');
    }
    setOpen(nextOpen);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open]);

  const handleClick = useCallback(
    (family: string) => {
      setSelected(family);
      ensureFontsLoaded([family]);
      onChange(family);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="border-input hover:bg-accent flex h-7 w-full items-center rounded-md border px-2 text-left text-[11px]">
          <span className="truncate">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0"
        side="left"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-border flex items-center gap-1.5 border-b px-2 py-1.5">
          <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fonts..."
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[11px] outline-none"
          />
        </div>
        <div ref={scrollRefCallback} className="overflow-auto" style={{ height: VISIBLE_HEIGHT }}>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualItems.map((virtualItem) => {
              const font = filtered[virtualItem.index]!;
              const isActive = selected === font.family;
              const ready = isFontPreviewReady(font.family);
              return (
                <button
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  className={`absolute left-0 flex w-full items-center px-2 text-[12px] transition-colors ${
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                  }`}
                  style={{
                    height: ITEM_HEIGHT,
                    transform: `translateY(${virtualItem.start}px)`,
                    fontFamily: ready ? `"${font.family}", ${font.category}` : undefined,
                  }}
                  onClick={() => handleClick(font.family)}
                >
                  <span className="truncate">{font.family}</span>
                </button>
              );
            })}
          </div>
        </div>
        {filtered.length === 0 && (
          <div className="text-muted-foreground py-4 text-center text-[11px]">No fonts found</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
