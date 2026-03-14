import type { Project } from '@draftila/shared';
import { formatDistanceToNow } from '@/lib/format';

export function ProjectCard({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(project.id)}
      className="group flex cursor-pointer flex-col gap-2 text-left"
    >
      <div className="bg-muted border-border aspect-[4/3] overflow-hidden border transition-shadow group-hover:shadow-md">
        <div className="flex h-full items-center justify-center">
          <span className="text-muted-foreground text-2xl font-semibold">
            {project.name.charAt(0).toUpperCase()}
          </span>
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
