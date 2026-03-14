import { Link } from 'react-router-dom';
import type { Draft } from '@draftila/shared';
import { FileIcon } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/format';

export function DraftListItem({ draft }: { draft: Draft }) {
  return (
    <Link
      to={`/drafts/${draft.id}`}
      className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 transition-colors"
    >
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded">
        <FileIcon className="text-muted-foreground size-4" />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{draft.name}</p>
      <p className="text-muted-foreground shrink-0 text-xs">
        Edited {formatDistanceToNow(draft.updatedAt)}
      </p>
    </Link>
  );
}
