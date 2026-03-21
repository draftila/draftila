import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { useProjects } from '@/api/projects';
import { useDashboardStore } from '@/stores/dashboard-store';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { UserMenu } from '@/components/user-menu';
import { ErrorState } from '@/components/error-state';
import { ProjectCard } from './components/project-card';
import { ProjectListItem } from './components/project-list-item';
import { ProjectsToolbar } from './components/projects-toolbar';
import { CreateProjectDialog } from './components/create-project-dialog';

export function ProjectsPage() {
  const navigate = useNavigate();
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId);
  const sortOrder = useDashboardStore((s) => s.projectsSortOrder);
  const viewMode = useDashboardStore((s) => s.projectsViewMode);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: projectsResponse, isLoading, isError, error } = useProjects({ sort: sortOrder });
  const projects = projectsResponse?.data ?? [];

  function handleProjectCreated(project: { id: string; name: string }) {
    setSelectedProjectId(project.id);
    navigate('/');
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">All Projects</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <PlusIcon />
            New Project
          </Button>
        </div>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <UserMenu />
      </header>
      <div className="flex flex-1 flex-col overflow-auto p-6">
        <div className="mb-6">
          <ProjectsToolbar />
        </div>
        {isError ? (
          <ErrorState error={error} />
        ) : isLoading ? null : projects.length === 0 ? (
          <EmptyState onCreateProject={() => setCreateDialogOpen(true)} />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {projects.map((project) => (
              <ProjectListItem key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleProjectCreated}
      />
    </div>
  );
}

function EmptyState({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="text-muted-foreground text-center">
        <p className="text-lg font-medium">No projects yet</p>
        <p className="text-sm">Create your first project to get started.</p>
      </div>
      <Button onClick={onCreateProject}>
        <PlusIcon />
        New Project
      </Button>
    </div>
  );
}
