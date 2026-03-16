import { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDraftById, useUpdateDraft } from '@/api/drafts';
import { useSession } from '@/lib/auth-client';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InlineEditableText } from '@/components/inline-editable-text';
import { UserMenu } from '@/components/user-menu';
import { initUndoManager, destroyUndoManager } from '@draftila/engine/history';
import { getMoveTool } from '@draftila/engine/tools/tool-manager';
import { useEditorStore } from '@/stores/editor-store';
import { LeftPanel } from './components/left-panel';
import { RightPanel } from './components/right-panel';
import { Canvas } from './components/canvas';
import { useYjs } from './hooks/use-yjs';
import { useKeyboard } from './hooks/use-keyboard';
import { useAwareness } from './hooks/use-awareness';

export function EditorPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { data: draft, isLoading, isError } = useDraftById(draftId ?? '');
  const { ydoc, provider, connected } = useYjs({ draftId: draftId ?? '', enabled: !!draft });
  const { data: session } = useSession();

  const userId = session?.user?.id ?? 'anonymous';
  const userName = session?.user?.name ?? 'Anonymous';

  const updateDraft = useUpdateDraft(draft?.projectId ?? '');

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
    initUndoManager(ydoc);
    return () => destroyUndoManager();
  }, [ydoc]);

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
    </div>
  );
}
