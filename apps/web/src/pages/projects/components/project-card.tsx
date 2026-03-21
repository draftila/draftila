import type { Project } from '@draftila/shared';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from '@/lib/format';

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${project.id}/settings`)}
      className="group flex cursor-pointer flex-col gap-2 text-left"
    >
      <div className="bg-muted border-border aspect-[4/3] overflow-hidden border transition-shadow group-hover:shadow-md">
        <div className="flex h-full items-center justify-center">
          {project.logo ? (
            <img src={project.logo} alt={project.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-muted-foreground text-2xl font-semibold">
              {project.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="text-muted-foreground text-xs">
          Edited {formatDistanceToNow(project.updatedAt)}
        </p>
      </div>
    </button>
  );
}
