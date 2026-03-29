import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLinkIcon, CopyIcon, PencilIcon, TrashIcon, DownloadIcon } from 'lucide-react';
import type { Draft } from '@draftila/shared';
import { downloadBlob } from '@draftila/engine';
import { useDeleteDraft, useUpdateDraft, useExportDraft } from '@/api/drafts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function DraftContextMenu({ draft, children }: { draft: Draft; children: React.ReactNode }) {
  const navigate = useNavigate();
  const deleteDraft = useDeleteDraft(draft.projectId);
  const updateDraft = useUpdateDraft(draft.projectId);
  const exportDraft = useExportDraft(draft.projectId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(draft.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameOpen) {
      setRenameName(draft.name);
    }
  }, [renameOpen, draft.name]);

  function handleOpen() {
    navigate(`/drafts/${draft.id}`);
  }

  function handleExport() {
    exportDraft.mutate(draft.id, {
      onSuccess: (data) => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const filename = `${draft.name.replace(/[/\\?%*:|"<>]/g, '_')}.draftila.json`;
        downloadBlob(blob, filename);
        toast.success('Draft exported');
      },
      onError: () => {
        toast.error('Failed to export draft');
      },
    });
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/drafts/${draft.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  }

  function handleDelete() {
    deleteDraft.mutate(draft.id, {
      onSuccess: () => {
        toast.success('Draft deleted');
        setDeleteOpen(false);
      },
    });
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === draft.name) {
      setRenameOpen(false);
      return;
    }
    updateDraft.mutate(
      { draftId: draft.id, data: { name: trimmed } },
      {
        onSuccess: () => {
          toast.success('Draft renamed');
          setRenameOpen(false);
        },
      },
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleOpen}>
            <ExternalLinkIcon />
            Open
          </ContextMenuItem>
          <ContextMenuItem onSelect={handleCopyLink}>
            <CopyIcon />
            Copy Link
          </ContextMenuItem>
          <ContextMenuItem onSelect={handleExport} disabled={exportDraft.isPending}>
            <DownloadIcon />
            Export
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setRenameOpen(true)}>
            <PencilIcon />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <TrashIcon />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{draft.name}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteDraft.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Rename draft</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename}>
            <Input
              ref={renameInputRef}
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
              maxLength={255}
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameName.trim() || updateDraft.isPending}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
