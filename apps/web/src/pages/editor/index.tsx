import { useParams, useNavigate } from 'react-router-dom';
import { useDraftById } from '@/api/drafts';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { EditorToolbar } from './components/editor-toolbar';
import { LeftPanel } from './components/left-panel';
import { RightPanel } from './components/right-panel';
import { Canvas } from './components/canvas';

export function EditorPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { data: draft, isLoading, isError } = useDraftById(draftId ?? '');

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
      <header className="flex h-12 shrink-0 items-center gap-2 border-b pl-2 pr-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{draft.name}</span>
        </div>
        <div className="ml-auto">
          <EditorToolbar />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        <Canvas />
        <RightPanel />
      </div>
    </div>
  );
}
