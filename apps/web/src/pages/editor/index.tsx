import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDraftById, useUpdateDraft } from '@/api/drafts';
import { useSession } from '@/lib/auth-client';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InlineEditableText } from '@/components/inline-editable-text';
import { UserMenu } from '@/components/user-menu';
import { getActivePageId, setActivePage } from '@draftila/engine';
import { DEFAULT_CAMERA } from '@draftila/engine/camera';
import { initUndoManager, destroyUndoManager } from '@draftila/engine/history';
import { getMoveTool } from '@draftila/engine/tools/tool-manager';
import { useEditorStore } from '@/stores/editor-store';
import { LeftPanel } from './components/left-panel';
import { RightPanel } from './components/right-panel';
import { Canvas } from './components/canvas';
import { useYjs } from './hooks/use-yjs';
import { useKeyboard } from './hooks/use-keyboard';
import { useAwareness } from './hooks/use-awareness';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';

export function EditorPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { data: draft, isLoading, isError } = useDraftById(draftId ?? '');
  const { ydoc, provider, connected, applyingRemoteChanges } = useYjs({
    draftId: draftId ?? '',
    enabled: !!draft,
  });
  const { data: session } = useSession();

  const userId = session?.user?.id ?? 'anonymous';
  const userName = session?.user?.name ?? 'Anonymous';

  const updateDraft = useUpdateDraft(draft?.projectId ?? '');
  const activePageId = useEditorStore((s) => s.activePageId);
  const setActivePageId = useEditorStore((s) => s.setActivePageId);
  const lastPageIdRef = useRef<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const handleShortcutKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleShortcutKey);
    return () => window.removeEventListener('keydown', handleShortcutKey);
  }, []);

  const handleRenameDraft = useCallback(
    (name: string) => {
      if (!draftId) return;
      updateDraft.mutate({ draftId, data: { name } });
    },
    [draftId, updateDraft],
  );

  const { remoteUsers, updateCursor, updateSelection, updateActiveTool } = useAwareness(
    provider,
    userId,
    userName,
  );

  useKeyboard({ ydoc });

  useEffect(() => {
    const pageId = activePageId ?? getActivePageId(ydoc);
    if (pageId) {
      setActivePage(ydoc, pageId);
    }
    if (pageId && activePageId !== pageId) {
      setActivePageId(pageId);
    }

    if (pageId && lastPageIdRef.current && lastPageIdRef.current !== pageId) {
      const store = useEditorStore.getState();
      store.clearSelection();
      store.setEnteredGroupId(null);
      store.setHoveredId(null);
      store.setEditingTextId(null);
      store.setCamera(DEFAULT_CAMERA);
    }
    if (pageId) {
      lastPageIdRef.current = pageId;
    }

    initUndoManager(ydoc);
    return () => destroyUndoManager();
  }, [ydoc, activePageId, setActivePageId]);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.selectedIds !== prev.selectedIds) {
        if (!getMoveTool().marqueeRect) {
          updateSelection(state.selectedIds);
        }
      }
      if (state.activeTool !== prev.activeTool) {
        updateActiveTool(state.activeTool);
      }
    });
    return unsubscribe;
  }, [updateSelection, updateActiveTool]);

  const handleActiveInteraction = useCallback(
    (cursor: { x: number; y: number } | null) => {
      updateCursor(cursor);
    },
    [updateCursor],
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (isError || !draft) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm">Draft not found or access denied.</p>
        <button
          className="text-primary text-sm underline underline-offset-4"
          onClick={() => navigate('/')}
        >
          Back to Drafts
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <InlineEditableText
          value={draft.name}
          onSave={handleRenameDraft}
          className="text-sm font-medium"
        />
        <Tooltip>
          <TooltipTrigger>
            <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          </TooltipTrigger>
          <TooltipContent>{connected ? 'Connected' : 'Disconnected'}</TooltipContent>
        </Tooltip>
        {applyingRemoteChanges && (
          <div className="bg-muted/60 border-border text-muted-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Applying changes...
          </div>
        )}
        <div className="flex-1" />
        {remoteUsers.length > 0 && (
          <div className="flex gap-1">
            {remoteUsers.map((user) => (
              <Tooltip key={user.clientId}>
                <TooltipTrigger>
                  <div
                    className="border-border flex size-7 items-center justify-center rounded-sm border text-[10px] font-bold text-white"
                    style={{ backgroundColor: user.user.color }}
                  >
                    {user.user.name.charAt(0).toUpperCase()}
                  </div>
                </TooltipTrigger>
                <TooltipContent>{user.user.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <UserMenu />
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <LeftPanel ydoc={ydoc} draftName={draft.name} projectId={draft.projectId} />
        <Canvas
          ydoc={ydoc}
          remoteUsers={remoteUsers}
          onActiveInteraction={handleActiveInteraction}
        />
        <RightPanel ydoc={ydoc} />
      </div>
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
