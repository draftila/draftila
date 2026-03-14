import type { Project } from '@draftila/shared';
import { FolderIcon } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/format';

export function ProjectListItem({
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
      className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-left transition-colors"
    >
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded">
        <FolderIcon className="text-muted-foreground size-4" />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</p>
      <p className="text-muted-foreground shrink-0 text-xs">
        Edited {formatDistanceToNow(project.updatedAt)}
      </p>
    </button>
  );
}
