import { useCallback } from 'react';
import { toast } from 'sonner';
import type { SnapshotWithAuthor } from '@draftila/shared';
import { Button } from '@/components/ui/button';
import { useRestoreSnapshot } from '@/api/snapshots';
import { useEditorStore } from '@/stores/editor-store';
import { formatDistanceToNow } from '@/lib/format';

interface VersionPreviewBannerProps {
  draftId: string;
  snapshot: SnapshotWithAuthor | undefined;
}

export function VersionPreviewBanner({ draftId, snapshot }: VersionPreviewBannerProps) {
  const restoreSnapshot = useRestoreSnapshot(draftId);

  const handleBack = useCallback(() => {
    useEditorStore.getState().exitPreviewMode();
  }, []);

  const handleRestore = useCallback(async () => {
    const snapshotId = useEditorStore.getState().previewSnapshotId;
    if (!snapshotId) return;

    try {
      await restoreSnapshot.mutateAsync(snapshotId);
      toast.success('Version restored');
      window.location.reload();
    } catch {
      toast.error('Failed to restore version');
    }
  }, [restoreSnapshot]);

  const label = snapshot?.name
    ? `Viewing "${snapshot.name}"`
    : snapshot
      ? `Viewing version from ${formatDistanceToNow(snapshot.createdAt)}`
      : 'Viewing previous version';

  return (
    <div className="bg-card border-border absolute left-1/2 top-7 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 shadow-sm">
      <span className="text-foreground text-xs font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" className="h-7 text-xs" onClick={handleRestore}>
          Restore
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleBack}>
          Back to current
        </Button>
      </div>
    </div>
  );
}
