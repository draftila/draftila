import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PanelLeft, Upload, Eye, Keyboard, History } from 'lucide-react';
import logoSvg from '@/assets/logo.svg';
import { useDraftById, useUpdateDraft } from '@/api/drafts';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InlineEditableText } from '@/components/inline-editable-text';
import { UserMenu } from '@/components/user-menu';
import { getActivePageId, setActivePage } from '@draftila/engine';
import { DEFAULT_CAMERA } from '@draftila/engine/camera';
import { initUndoManager, destroyUndoManager } from '@draftila/engine/history';
import { getMoveTool } from '@draftila/engine/tools/tool-manager';
import { addShape } from '@draftila/engine/scene-graph';
import {
  initializeDefaultAdapters,
  importSvgFile,
  interchangeToShapeData,
} from '@draftila/engine/interchange';
import { useEditorStore } from '@/stores/editor-store';
import { LeftPanel } from './components/left-panel';
import { RightPanel } from './components/right-panel';
import { Canvas } from './components/canvas';
import { useYjs } from './hooks/use-yjs';
import { useKeyboard } from './hooks/use-keyboard';
import { fitCameraToAllShapes } from './lib/fit-camera';
import { useAwareness } from './hooks/use-awareness';
import { useThumbnail } from './hooks/use-thumbnail';
import { useRpc } from './hooks/use-rpc';
import { KeyboardShortcutsDialog } from './components/keyboard-shortcuts-dialog';
import { SaveVersionDialog } from './components/save-version-dialog';
import { VersionPreviewBanner } from './components/version-preview-banner';
import { useSnapshots } from '@/api/snapshots';

function ViewMenuItems() {
  const commentsVisible = useEditorStore((s) => s.commentsVisible);

  return (
    <>
      <DropdownMenuCheckboxItem
        checked={commentsVisible}
        onCheckedChange={(checked) => {
          useEditorStore.getState().setCommentsVisible(checked);
        }}
      >
        Comments
        <span className="text-muted-foreground ml-auto pl-4 text-[11px]">{'\u21E7C'}</span>
      </DropdownMenuCheckboxItem>
    </>
  );
}

export function EditorPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { data: draft, isLoading, isError, error } = useDraftById(draftId ?? '');
  const { ydoc, provider, connected, synced, applyingRemoteChanges, reinitialize } = useYjs({
    draftId: draftId ?? '',
    enabled: !!draft,
  });
  const { data: session } = useSession();

  const userId = session?.user?.id ?? 'anonymous';
  const userName = session?.user?.name ?? 'Anonymous';

  const updateDraft = useUpdateDraft(draft?.projectId ?? '');
  const activePageId = useEditorStore((s) => s.activePageId);
  const setActivePageId = useEditorStore((s) => s.setActivePageId);
  const previewSnapshotId = useEditorStore((s) => s.previewSnapshotId);
  const previewYdoc = useEditorStore((s) => s.previewYdoc);
  const lastPageIdRef = useRef<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPreview = !!previewSnapshotId && !!previewYdoc;
  const activeYdoc = isPreview ? previewYdoc : ydoc;

  const { data: snapshots } = useSnapshots(draftId ?? '', true);
  const previewSnapshot = snapshots?.find((s) => s.id === previewSnapshotId);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      initializeDefaultAdapters();
      const newIds: string[] = [];

      for (const file of files) {
        if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
          const doc = await importSvgFile(file);
          const shapeData = interchangeToShapeData(doc);
          const indexToId = new Map<number, string>();

          for (let i = 0; i < shapeData.length; i++) {
            const item = shapeData[i]!;
            const parentId =
              item.parentIndex !== null ? (indexToId.get(item.parentIndex) ?? null) : null;

            const id = addShape(ydoc, item.type, {
              ...item.props,
              x: ((item.props['x'] as number) ?? 0) + 100,
              y: ((item.props['y'] as number) ?? 0) + 100,
              parentId,
            });
            indexToId.set(i, id);

            if (item.parentIndex === null) {
              newIds.push(id);
            }
          }
        }
      }

      if (newIds.length > 0) {
        useEditorStore.getState().setSelectedIds(newIds);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [ydoc],
  );

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
  useThumbnail(draftId ?? '', ydoc, synced);
  useRpc({ provider, ydoc, enabled: synced });

  useEffect(() => {
    useEditorStore.getState().setReinitializeYjs(reinitialize);
    return () => useEditorStore.getState().setReinitializeYjs(null);
  }, [reinitialize]);

  useEffect(() => {
    if (!synced) return;
    requestAnimationFrame(() => fitCameraToAllShapes(ydoc));
  }, [synced, ydoc]);

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

  if (isError || (!isLoading && !draft)) {
    const errorMessage =
      isError && error instanceof Error ? error.message : 'Draft not found or access denied.';
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm">{errorMessage}</p>
        <button
          className="text-primary text-sm underline underline-offset-4"
          onClick={() => navigate('/')}
        >
          Back to Drafts
        </button>
      </div>
    );
  }

  if (isLoading || !synced || !draft) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center border-b">
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          className="hidden"
          onChange={handleImportFile}
        />
        <div className="flex h-full w-60 shrink-0 items-center gap-1 border-r px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 cursor-pointer">
                <img src={logoSvg} alt="Draftila" className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => navigate('/')}>Drafts</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Import SVG
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <ViewMenuItems />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const store = useEditorStore.getState();
                  store.setVersionHistoryOpen(!store.versionHistoryOpen);
                  store.setRightPanelOpen(true);
                }}
              >
                <History className="mr-2 h-4 w-4" />
                Version History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <InlineEditableText
              value={draft.name}
              onSave={handleRenameDraft}
              className="min-w-0 max-w-full truncate text-sm font-medium"
              inputClassName="w-full"
            />
            <Tooltip>
              <TooltipTrigger>
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                />
              </TooltipTrigger>
              <TooltipContent>{connected ? 'Connected' : 'Disconnected'}</TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  const store = useEditorStore.getState();
                  store.setLeftPanelOpen(!store.leftPanelOpen);
                }}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle left panel</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-1 items-center gap-2 px-2">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  const store = useEditorStore.getState();
                  store.setVersionHistoryOpen(!store.versionHistoryOpen);
                  store.setRightPanelOpen(true);
                }}
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Version History</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setShortcutsOpen(true)}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              <span>Keyboard shortcuts</span>
              <kbd className="bg-muted/20 rounded px-1.5 py-0.5 font-mono text-[10px]">?</kbd>
            </TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
          <UserMenu />
        </div>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <LeftPanel ydoc={activeYdoc} />
        {isPreview && <VersionPreviewBanner draftId={draftId ?? ''} snapshot={previewSnapshot} />}
        <Canvas
          ydoc={activeYdoc}
          draftId={draftId ?? ''}
          userId={userId}
          userName={userName}
          remoteUsers={isPreview ? [] : remoteUsers}
          onActiveInteraction={isPreview ? undefined : handleActiveInteraction}
        />
        <RightPanel ydoc={activeYdoc} draftId={draftId ?? ''} />
      </div>
      <SaveVersionDialog draftId={draftId ?? ''} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
