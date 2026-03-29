import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCreateSnapshot } from '@/api/snapshots';
import { useEditorStore } from '@/stores/editor-store';

interface SaveVersionDialogProps {
  draftId: string;
}

export function SaveVersionDialog({ draftId }: SaveVersionDialogProps) {
  const open = useEditorStore((s) => s.saveVersionDialogOpen);
  const [name, setName] = useState('');
  const createSnapshot = useCreateSnapshot(draftId);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    useEditorStore.getState().setSaveVersionDialogOpen(nextOpen);
    if (!nextOpen) setName('');
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await createSnapshot.mutateAsync({ name: trimmed });
      toast.success('Version saved');
      handleOpenChange(false);
    } catch {
      toast.error('Failed to save version');
    }
  }, [name, createSnapshot, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Version</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="e.g. Final header layout"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || createSnapshot.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
