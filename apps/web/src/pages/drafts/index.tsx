import { useEffect } from 'react';
import { PlusIcon } from 'lucide-react';
import { useAllDrafts, useDrafts, useCreateDraft } from '@/api/drafts';
import { useProjects } from '@/api/projects';
import { useDashboardStore } from '@/stores/dashboard-store';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { DraftCard } from './components/draft-card';
import { DraftListItem } from './components/draft-list-item';
import { DraftsToolbar } from './components/drafts-toolbar';

export function DraftsPage() {
  const { data: projectsResponse, isLoading: projectsLoading } = useProjects();
  const selectedProjectId = useDashboardStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId);
  const sortOrder = useDashboardStore((s) => s.sortOrder);
  const viewMode = useDashboardStore((s) => s.viewMode);

  const projects = projectsResponse?.data ?? [];

  useEffect(() => {
    if (selectedProjectId && !projects.find((p) => p.id === selectedProjectId)) {
      if (projects.length > 0) {
        const personal = projects.find((p) => p.isPersonal);
        setSelectedProjectId(personal?.id ?? projects[0]!.id);
      }
    }
  }, [selectedProjectId, projects, setSelectedProjectId]);

  const projectDraftsQuery = useDrafts(selectedProjectId ?? '', { sort: sortOrder });
  const allDraftsQuery = useAllDrafts({ sort: sortOrder });

  const isAllProjects = !selectedProjectId;
  const draftsQuery = isAllProjects ? allDraftsQuery : projectDraftsQuery;
  const drafts = draftsQuery.data?.data ?? [];
  const isLoading = projectsLoading || draftsQuery.isLoading;

  const createProjectId = selectedProjectId ?? projects.find((p) => p.isPersonal)?.id ?? '';
  const createDraft = useCreateDraft(createProjectId);

  function handleCreateDraft() {
    createDraft.mutate({ name: 'Untitled' });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b pl-2 pr-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">Drafts</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={handleCreateDraft} disabled={!createProjectId}>
            <PlusIcon />
            New Draft
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col overflow-auto p-6">
        <div className="mb-6">
          <DraftsToolbar projects={projects} />
        </div>
        {isLoading ? null : drafts.length === 0 ? (
          <EmptyState onCreateDraft={handleCreateDraft} disabled={!createProjectId} />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {drafts.map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {drafts.map((draft) => (
              <DraftListItem key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreateDraft, disabled }: { onCreateDraft: () => void; disabled: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="text-muted-foreground text-center">
        <p className="text-lg font-medium">No drafts yet</p>
        <p className="text-sm">Create your first draft to get started.</p>
      </div>
      <Button onClick={onCreateDraft} disabled={disabled}>
        <PlusIcon />
        New Draft
      </Button>
    </div>
  );
}
