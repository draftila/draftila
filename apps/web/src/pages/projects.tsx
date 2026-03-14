import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { useProjects } from '@/api/projects';
import { useDashboardStore } from '@/stores/dashboard-store';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ProjectCard } from '@/components/project-card';
import { CreateProjectDialog } from '@/components/create-project-dialog';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projectsResponse, isLoading } = useProjects();
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const projects = projectsResponse?.data ?? [];

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    navigate('/');
  }

  function handleProjectCreated(project: { id: string; name: string }) {
    setSelectedProjectId(project.id);
    navigate('/');
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b pl-2 pr-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">All Projects</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <PlusIcon />
            New Project
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? null : projects.length === 0 ? (
          <EmptyState onCreateProject={() => setCreateDialogOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onSelect={handleSelectProject} />
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
