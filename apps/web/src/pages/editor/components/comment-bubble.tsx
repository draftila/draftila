import { useMemo, useState } from 'react';
import type { CommentResponse } from '@draftila/shared';

interface CommentBubbleProps {
  x: number;
  y: number;
  thread: CommentResponse | null;
  active: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

function hasUnread(thread: CommentResponse | null): boolean {
  if (!thread) return false;
  if (thread.unread) return true;
  const stack = [...thread.replies];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.unread) return true;
    for (const reply of current.replies) {
      stack.push(reply);
    }
  }
  return false;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min. ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr. ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(date),
  );
}

export function CommentBubble({
  x,
  y,
  thread,
  active,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: CommentBubbleProps) {
  const initial = (thread?.author.name ?? '?').slice(0, 1).toUpperCase();
  const unread = useMemo(() => hasUnread(thread), [thread]);
  const resolved = thread?.resolved ?? false;
  const [hovered, setHovered] = useState(false);

  const expanded = hovered && !active && !!thread;

  return (
    <button
      type="button"
      data-comment-bubble="true"
      className={`absolute z-30 ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      style={{ left: x, top: y }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      title={thread ? `${thread.author.name}: ${thread.content}` : 'Comment'}
    >
      <div
        className={`bg-popover absolute bottom-0 left-0 flex origin-bottom-left items-center overflow-hidden rounded-full px-1 shadow-lg transition-all duration-200 ease-out ${unread || active ? 'ring-2 ring-blue-500' : 'ring-0'}`}
      >
        <div
          className={`flex shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200 ${
            resolved ? 'bg-muted-foreground text-popover' : 'bg-primary text-primary-foreground'
          }`}
          style={{
            width: expanded ? 40 : 30,
            height: expanded ? 40 : 30,
          }}
        >
          {initial}
        </div>

        <div
          className={`overflow-hidden whitespace-nowrap transition-all duration-200 ease-out ${expanded ? 'ml-2 max-w-[280px] p-2 opacity-100' : 'max-w-0 opacity-0'}`}
        >
          {thread && (
            <div className="text-popover-foreground text-left">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-medium">{thread.author.name}</span>
                <span className="text-muted-foreground text-xs">
                  {formatRelativeTime(thread.createdAt)}
                </span>
              </div>
              <p className="max-w-[220px] truncate text-[13px]">{thread.content}</p>
            </div>
          )}
        </div>
      </div>

      {unread && (
        <span
          className="absolute z-20 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 dark:border-gray-900"
          style={{ left: 26, bottom: 28 }}
        />
      )}
    </button>
  );
}
