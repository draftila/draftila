import { useCallback, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Plus, X } from 'lucide-react';
import type { SnapshotWithAuthor } from '@draftila/shared';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useSnapshots, useUpdateSnapshot, fetchSnapshotState } from '@/api/snapshots';
import { useEditorStore } from '@/stores/editor-store';
import { formatDistanceToNow } from '@/lib/format';

interface VersionHistoryPanelProps {
  draftId: string;
}

function formatDayLabel(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDayKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function VersionEntry({
  snapshot,
  onPreview,
  onRename,
}: {
  snapshot: SnapshotWithAuthor;
  onPreview: () => void;
  onRename: () => void;
}) {
  const previewSnapshotId = useEditorStore((s) => s.previewSnapshotId);
  const isActive = previewSnapshotId === snapshot.id;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          className={`hover:bg-muted/50 flex w-full flex-col gap-0.5 px-3 py-2 text-left ${isActive ? 'bg-muted' : ''}`}
          onClick={onPreview}
        >
          <span className={`text-xs ${snapshot.name ? 'font-medium' : 'text-muted-foreground'}`}>
            {snapshot.name ?? 'Auto-save'}
          </span>
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <span>{formatDistanceToNow(snapshot.createdAt)}</span>
            {snapshot.author && (
              <>
                <span>&middot;</span>
                <span>{snapshot.author.name}</span>
              </>
            )}
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {snapshot.name ? (
          <>
            <ContextMenuItem onClick={onRename}>Rename</ContextMenuItem>
            <ContextMenuItem onClick={onRename}>Remove Name</ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onClick={onRename}>Name This Version</ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function VersionHistoryPanel({ draftId }: VersionHistoryPanelProps) {
  const [showAutoSaves, setShowAutoSaves] = useState(
    () => localStorage.getItem('draftila:showAutoSaves') !== 'false',
  );
  const [renamingSnapshot, setRenamingSnapshot] = useState<SnapshotWithAuthor | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: snapshots, isLoading } = useSnapshots(draftId, true);
  const updateSnapshot = useUpdateSnapshot(draftId);

  const handlePreview = useCallback(async (snapshotId: string) => {
    const state = await fetchSnapshotState(snapshotId);
    const previewDoc = new Y.Doc();
    Y.applyUpdate(previewDoc, state);
    useEditorStore.getState().enterPreviewMode(snapshotId, previewDoc);
  }, []);

  const handleStartRename = useCallback((snapshot: SnapshotWithAuthor) => {
    setRenamingSnapshot(snapshot);
    setRenameValue(snapshot.name ?? '');
  }, []);

  const handleSubmitRename = useCallback(() => {
    if (!renamingSnapshot) return;

    const trimmed = renameValue.trim();
    const newName = trimmed || null;

    updateSnapshot.mutate({
      snapshotId: renamingSnapshot.id,
      data: { name: newName },
    });

    setRenamingSnapshot(null);
    setRenameValue('');
  }, [renamingSnapshot, renameValue, updateSnapshot]);

  const handleCancelRename = useCallback(() => {
    setRenamingSnapshot(null);
    setRenameValue('');
  }, []);

  const filtered = useMemo(() => {
    if (!snapshots) return [];
    return showAutoSaves ? snapshots : snapshots.filter((s) => s.name);
  }, [snapshots, showAutoSaves]);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: SnapshotWithAuthor[] }[] = [];
    let currentKey = '';

    for (const s of filtered) {
      const date = new Date(s.createdAt);
      const key = getDayKey(date);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({ label: formatDayLabel(date), entries: [] });
      }
      groups[groups.length - 1]!.entries.push(s);
    }

    return groups;
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium">Version History</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => useEditorStore.getState().setVersionHistoryOpen(false)}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={showAutoSaves}
            onChange={(e) => {
              setShowAutoSaves(e.target.checked);
              localStorage.setItem('draftila:showAutoSaves', String(e.target.checked));
            }}
            className="size-3 rounded"
          />
          Show auto-saves
        </label>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="text-muted-foreground p-3 text-center text-xs">Loading...</div>
        )}

        {!isLoading && grouped.length === 0 && (
          <div className="text-muted-foreground p-3 text-center text-xs">No versions yet</div>
        )}

        {grouped.map((group) => (
          <div key={group.label}>
            <div className="text-muted-foreground bg-muted/30 sticky top-0 px-3 py-1.5 text-[11px] font-medium">
              {group.label}
            </div>
            {group.entries.map((s) => (
              <VersionEntry
                key={s.id}
                snapshot={s}
                onPreview={() => handlePreview(s.id)}
                onRename={() => handleStartRename(s)}
              />
            ))}
          </div>
        ))}
      </div>

      {renamingSnapshot && (
        <div className="border-t px-3 py-2">
          <input
            autoFocus
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            placeholder="Version name..."
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmitRename();
              if (e.key === 'Escape') handleCancelRename();
            }}
            onBlur={handleSubmitRename}
          />
        </div>
      )}

      <div className="border-t px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => useEditorStore.getState().setSaveVersionDialogOpen(true)}
        >
          <Plus className="mr-1 size-3" />
          Save Version
        </Button>
      </div>
    </div>
  );
}
