import { Link } from 'react-router-dom';
import type { Draft } from '@draftila/shared';
import { formatDistanceToNow } from '@/lib/format';
import { DraftContextMenu } from './draft-context-menu';

export function DraftCard({ draft }: { draft: Draft }) {
  return (
    <DraftContextMenu draft={draft}>
      <Link to={`/drafts/${draft.id}`} className="group flex cursor-pointer flex-col gap-2">
        <div className="bg-muted border-border aspect-[4/3] overflow-hidden border transition-shadow group-hover:shadow-md">
          {draft.thumbnail ? (
            <img
              src={draft.thumbnail}
              alt={draft.name}
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-muted-foreground text-2xl font-semibold">
                {draft.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 px-1">
          <p className="truncate text-sm font-medium">{draft.name}</p>
          <p className="text-muted-foreground text-xs">
            Edited {formatDistanceToNow(draft.updatedAt)}
          </p>
        </div>
      </Link>
    </DraftContextMenu>
  );
}
