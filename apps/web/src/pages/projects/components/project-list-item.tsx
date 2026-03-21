import type { Project } from '@draftila/shared';
import { useNavigate } from 'react-router-dom';
import { FolderIcon } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/format';

export function ProjectListItem({ project }: { project: Project }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${project.id}/settings`)}
      className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-left transition-colors"
    >
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded">
        {project.logo ? (
          <img src={project.logo} alt={project.name} className="size-8 rounded object-cover" />
        ) : (
          <FolderIcon className="text-muted-foreground size-4" />
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</p>
      <p className="text-muted-foreground shrink-0 text-xs">
        Edited {formatDistanceToNow(project.updatedAt)}
      </p>
    </button>
  );
}
