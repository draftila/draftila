import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { MoreHorizontal, Plus, Check, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  addPage,
  getActivePageId,
  getPages,
  observePages,
  removePage,
  renamePage,
  setActivePage,
  type PageData,
  DEFAULT_CAMERA,
} from '@draftila/engine';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/stores/editor-store';
import { applyCameraForPage, dropPendingCameraSave } from '@/pages/editor/lib/camera-session';
import { removePageCamera } from '@/lib/camera-storage';

interface PageListProps {
  ydoc: Y.Doc;
}

/**
 * Stays synchronous: setActivePageId and the camera land in the same event
 * handler batch, so the new page's first paint already has the right camera.
 * Moving this into an effect would flash one frame of the outgoing camera.
 */
function switchToPage(
  ydoc: Y.Doc,
  pageId: string,
  draftId: string | undefined,
  inPreview: boolean,
) {
  const switched = setActivePage(ydoc, pageId);
  if (!switched) return;

  const store = useEditorStore.getState();
  store.setActivePageId(pageId);
  store.clearSelection();
  store.setEnteredGroupId(null);
  store.setHoveredId(null);
  store.setEditingTextId(null);

  if (draftId && !inPreview) {
    applyCameraForPage(draftId, pageId, 'default', ydoc);
  } else {
    // Spread: the applied-camera identity marker must never alias the constant.
    store.setCamera({ ...DEFAULT_CAMERA });
  }
}

export function PageList({ ydoc }: PageListProps) {
  const { draftId } = useParams<{ draftId: string }>();
  const [pages, setPages] = useState<PageData[]>([]);
  const activePageId = useEditorStore((s) => s.activePageId);
  const setActivePageId = useEditorStore((s) => s.setActivePageId);
  const previewSnapshotId = useEditorStore((s) => s.previewSnapshotId);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const unsubscribe = observePages(ydoc, (nextPages, nextActivePageId) => {
      setPages(nextPages);
      setActivePageId(nextActivePageId);
    });

    return unsubscribe;
  }, [ydoc, setActivePageId]);

  const canDelete = useMemo(() => pages.length > 1, [pages.length]);

  const handleSwitchPage = useCallback(
    (pageId: string) => {
      if (pageId === activePageId) return;
      switchToPage(ydoc, pageId, draftId, !!previewSnapshotId);
    },
    [activePageId, ydoc, draftId, previewSnapshotId],
  );

  const handleAddPage = useCallback(() => {
    const nextId = addPage(ydoc);
    switchToPage(ydoc, nextId, draftId, !!previewSnapshotId);
    setRenamingPageId(nextId);
    setRenameValue(`Page ${pages.length + 1}`);
  }, [ydoc, pages, draftId, previewSnapshotId]);

  const startRename = useCallback((page: PageData) => {
    setRenamingPageId(page.id);
    setRenameValue(page.name);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingPageId) return;
    const trimmed = renameValue.trim();
    if (trimmed.length > 0) {
      renamePage(ydoc, renamingPageId, trimmed);
    }
    setRenamingPageId(null);
    setRenameValue('');
  }, [ydoc, renamingPageId, renameValue]);

  const cancelRename = useCallback(() => {
    setRenamingPageId(null);
    setRenameValue('');
  }, []);

  const handleDeletePage = useCallback(
    (pageId: string) => {
      removePage(ydoc, pageId);

      // Only the storage cleanup is preview-guarded: during preview `ydoc` is the
      // snapshot doc while `draftId` is the real draft, and shared page ids mean
      // unguarded cleanup would evict a still-existing live page's camera.
      // Deletion itself must keep working in preview.
      if (!previewSnapshotId && draftId && !getPages(ydoc).some((p) => p.id === pageId)) {
        // Drop first: a pan on this page may still be pending, and the flush
        // inside switchToPage's apply would otherwise resurrect the entry.
        dropPendingCameraSave(pageId);
        removePageCamera(draftId, pageId);
      }

      const fallbackActive = getActivePageId(ydoc);
      if (!fallbackActive) {
        return;
      }
      setActivePageId(fallbackActive);
      if (activePageId === pageId || !activePageId) {
        switchToPage(ydoc, fallbackActive, draftId, !!previewSnapshotId);
      }
    },
    [ydoc, activePageId, setActivePageId, draftId, previewSnapshotId],
  );

  return (
    <div className="border-b px-2 py-2">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
          Pages
        </span>
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={handleAddPage}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1">
        {pages.map((page) => {
          const isActive = page.id === activePageId;
          const isRenaming = page.id === renamingPageId;

          return (
            <div key={page.id} className="flex items-center gap-1">
              {isRenaming ? (
                <div className="flex h-7 flex-1 items-center gap-1 rounded-md border px-1">
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={commitRename}
                    className="h-5 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={commitRename}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={cancelRename}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`flex h-7 flex-1 items-center rounded-md px-2 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-muted text-foreground font-medium'
                      : 'hover:bg-muted text-foreground'
                  }`}
                  onClick={() => handleSwitchPage(page.id)}
                >
                  <span className="truncate">{page.name}</span>
                </button>
              )}
              {!isRenaming && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startRename(page)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canDelete}
                      className="text-red-600 focus:text-red-600"
                      onClick={() => handleDeletePage(page.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
