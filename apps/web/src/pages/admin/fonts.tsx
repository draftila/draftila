import { Fragment, useCallback, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, TrashIcon, UploadIcon } from 'lucide-react';
import type { FontFamilyDto } from '@draftila/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  FONTS_KEY,
  useDeleteFontFamily,
  useDeleteFontVariant,
  useFonts,
  useUploadFont,
} from '@/api/fonts';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { UserMenu } from '@/components/user-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/error-state';

const HELP_TEXT = [
  'A family name is fixed at upload time and can never be changed — shapes, exports and .draftila.json files all reference the bare string.',
  'Weight and style are read from the font file itself. If a variant is rejected as a duplicate, its internal metadata is wrong or duplicated — fix it in font tooling (fontTools, Glyphs) and re-upload.',
  'Variable fonts are not supported yet — upload static instances (one file per weight/style).',
  'Prefer WOFF2 files: they are the smallest, and exports embed the original bytes.',
  'Uploaded font files are served publicly at an unguessable URL. Only upload fonts whose licence permits that.',
  'Importing a .draftila.json on another instance needs a family with the same name uploaded there — font files are not bundled with drafts.',
];

type UploadStatus =
  | { kind: 'pending' }
  | { kind: 'uploading' }
  | { kind: 'waiting' }
  | { kind: 'done'; family: string; weight: number; style: string; warnings: string[] }
  | { kind: 'error'; message: string };

interface UploadRow {
  id: string;
  /** Kept so an errored row can be retried without re-dropping the file. */
  file: File;
  fileName: string;
  /** Family-name override captured at drop time, if the admin typed one. */
  name?: string;
  status: UploadStatus;
}

/** A proxy or CDN that 429s persistently must not pin a row — and with it the queue — forever. */
const MAX_RATE_LIMIT_RESUMES = 5;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AdminFontsPage() {
  const { data, isLoading, isError, error } = useFonts();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteFamily, setDeleteFamily] = useState<FontFamilyDto | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const uploadFont = useUploadFont();
  const removeVariant = useDeleteFontVariant();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const families = (data ?? []).filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  const setRowStatus = useCallback((id: string, status: UploadStatus) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }, []);

  const runUpload = useCallback(
    async (id: string, file: File, name?: string) => {
      for (let resumes = 0; ; resumes++) {
        setRowStatus(id, { kind: 'uploading' });
        try {
          const result = await uploadFont(file, name);
          setRowStatus(id, {
            kind: 'done',
            family: result.data.name,
            // The variant the server just created — `data.variants` is weight-sorted, so its last
            // entry is the heaviest face, not this one.
            weight: result.variant.weight,
            style: result.variant.style,
            warnings: result.warnings ?? [],
          });
          return;
        } catch (err) {
          // 429: the limiter already told us how long to wait — resume automatically rather than
          // surfacing a manual retry, up to a bounded number of attempts.
          if (err instanceof ApiError && err.status === 429 && resumes < MAX_RATE_LIMIT_RESUMES) {
            setRowStatus(id, { kind: 'waiting' });
            await sleep((err.retryAfterSeconds ?? 5) * 1000);
            continue;
          }
          setRowStatus(id, {
            kind: 'error',
            message: err instanceof ApiError ? err.message : 'Upload failed',
          });
          return;
        }
      }
    },
    [setRowStatus, uploadFont],
  );

  // SEQUENTIAL: one file per request, chained onto whatever is already in flight. The chain must
  // never reject, or every later drop would be silently skipped. Invalidation runs once per batch.
  const chain = useCallback(
    (run: () => Promise<void>) => {
      queueRef.current = queueRef.current
        .then(run)
        .then(() => queryClient.invalidateQueries({ queryKey: FONTS_KEY }))
        .catch(() => {});
    },
    [queryClient],
  );

  const enqueue = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const name = familyName.trim() || undefined;
      const queued = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        fileName: file.name,
        name,
        status: { kind: 'pending' } as UploadStatus,
      }));
      setRows((prev) => [...prev, ...queued]);
      setFamilyName('');

      chain(async () => {
        for (const row of queued) await runUpload(row.id, row.file, row.name);
      });
    },
    [chain, familyName, runUpload],
  );

  const retry = useCallback(
    (row: UploadRow) => {
      setRowStatus(row.id, { kind: 'pending' });
      chain(() => runUpload(row.id, row.file, row.name));
    },
    [chain, runUpload, setRowStatus],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      enqueue([...e.dataTransfer.files]);
    },
    [enqueue],
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">Fonts</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56"
          />
        </div>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <UserMenu />
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center ${
            dragging ? 'border-primary bg-accent/40' : 'border-border'
          }`}
        >
          <UploadIcon className="text-muted-foreground size-6" />
          <p className="text-sm font-medium">Drop font files here</p>
          <p className="text-muted-foreground text-xs">
            TTF, OTF, WOFF or WOFF2 — one file per weight/style. Uploaded one at a time.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            className="hidden"
            onChange={(e) => {
              enqueue([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            Choose files
          </Button>
          <div className="mt-2 flex w-full max-w-sm flex-col gap-1 text-left">
            <label htmlFor="font-family-name" className="text-xs font-medium">
              Family name (optional)
            </label>
            <Input
              id="font-family-name"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Read from the font file if left blank"
              className="h-8"
            />
            <p className="text-muted-foreground text-xs">
              Applied to the next files you add. A family name cannot be changed after it is
              created.
            </p>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Uploads</h2>
              <Button size="sm" variant="ghost" onClick={() => setRows([])}>
                Clear
              </Button>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className="border-border flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{row.fileName}</span>
                <UploadStatusLabel status={row.status} />
                {row.status.kind === 'error' && (
                  <Button size="sm" variant="outline" className="h-6" onClick={() => retry(row)}>
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Only a FIRST-load failure blanks the table: TanStack reports `error` on a refetch
            failure too, while retaining the data an upload just invalidated. */}
        {isError && !data ? (
          <ErrorState error={error} />
        ) : isLoading ? null : families.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            No custom fonts uploaded yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {families.map((family) => {
                const isOpen = expanded.has(family.id);
                return (
                  <Fragment key={family.id}>
                    <TableRow>
                      <TableCell className="font-medium">
                        <button
                          className="flex items-center gap-1"
                          onClick={() => toggleExpanded(family.id)}
                          aria-label={isOpen ? 'Collapse variants' : 'Expand variants'}
                        >
                          {isOpen ? (
                            <ChevronDownIcon className="size-3.5" />
                          ) : (
                            <ChevronRightIcon className="size-3.5" />
                          )}
                          {family.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{family.variants.length}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(family.createdAt as unknown as string).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteFamily(family)}
                          aria-label={`Delete ${family.name}`}
                        >
                          <TrashIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen &&
                      family.variants.map((variant) => (
                        <TableRow key={variant.id} className="bg-muted/30">
                          <TableCell className="text-muted-foreground pl-8 text-xs">
                            {variant.weight} {variant.style}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs uppercase">
                            {variant.format}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatSize(variant.fileSize)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={removeVariant.isPending}
                              onClick={() =>
                                removeVariant.mutate({
                                  familyId: family.id,
                                  variantId: variant.id,
                                })
                              }
                              aria-label={`Delete ${variant.weight} ${variant.style}`}
                            >
                              <TrashIcon />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="text-muted-foreground space-y-1.5 text-xs">
          <h2 className="text-foreground text-sm font-medium">Before you upload</h2>
          <ul className="list-disc space-y-1 pl-4">
            {HELP_TEXT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <DeleteFamilyDialog
        family={deleteFamily}
        onOpenChange={(open) => !open && setDeleteFamily(null)}
      />
    </div>
  );
}

function UploadStatusLabel({ status }: { status: UploadStatus }) {
  switch (status.kind) {
    case 'pending':
      return <span className="text-muted-foreground">Queued</span>;
    case 'uploading':
      return <span className="text-muted-foreground">Uploading...</span>;
    case 'waiting':
      return <span className="text-muted-foreground">Rate limited — waiting...</span>;
    case 'done':
      return (
        <span className="text-muted-foreground text-right">
          {status.family} · {status.weight} {status.style}
          {status.warnings.length > 0 && <> · {status.warnings.join('; ')}</>}
        </span>
      );
    case 'error':
      return <span className="text-destructive text-right">{status.message}</span>;
  }
}

function DeleteFamilyDialog({
  family,
  onOpenChange,
}: {
  family: FontFamilyDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const removeFamily = useDeleteFontFamily();

  function handleDelete() {
    if (!family) return;
    removeFamily.mutate(family.id, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={!!family} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Font Family</DialogTitle>
          <DialogDescription>
            Delete {family?.name} and all {family?.variants.length} of its files? Drafts using this
            font will fall back to a system font. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={removeFamily.isPending}>
            {removeFamily.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
