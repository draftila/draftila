import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, Trash2, X } from 'lucide-react';
import type { CommentResponse } from '@draftila/shared';
import { formatRelativeTime } from '@/lib/format';

interface CommentThreadPanelProps {
  x: number;
  y: number;
  thread: CommentResponse | null;
  isCreating: boolean;
  onCreate: (content: string) => Promise<void>;
  onReply: (parentId: string, content: string) => Promise<void>;
  onResolveToggle: (commentId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
}

function flattenThread(thread: CommentResponse | null): CommentResponse[] {
  if (!thread) return [];
  const list: CommentResponse[] = [];
  const stack: CommentResponse[] = [thread];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) continue;
    list.push(current);
    for (const reply of current.replies) {
      stack.push(reply);
    }
  }
  return list;
}

export function CommentThreadPanel({
  x,
  y,
  thread,
  isCreating,
  onCreate,
  onReply,
  onResolveToggle,
  onDelete,
  onClose,
  currentUserId,
  currentUserName,
}: CommentThreadPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const threadMessages = useMemo(() => flattenThread(thread), [thread]);

  useEffect(() => {
    if (isCreating) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [isCreating]);

  useEffect(() => {
    if (!isCreating && thread) {
      requestAnimationFrame(() => replyInputRef.current?.focus());
    }
  }, [isCreating, thread]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const submitCreate = async () => {
    const content = newComment.trim();
    if (!content) return;
    setSubmitting(true);
    try {
      await onCreate(content);
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async () => {
    if (!thread) return;
    const content = reply.trim();
    if (!content) return;
    setSubmitting(true);
    try {
      await onReply(thread.id, content);
      setReply('');
    } finally {
      setSubmitting(false);
    }
  };

  if (isCreating) {
    return (
      <div
        className="absolute z-40 flex items-center gap-2"
        style={{
          left: Math.max(12, Math.min(window.innerWidth - 380, x + 42)),
          top: Math.max(12, y - 36),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bg-popover text-popover-foreground flex items-center gap-2 shadow-lg">
          <input
            ref={createInputRef}
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submitCreate();
              }
            }}
            placeholder="Add a comment…"
            className="bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-500"
            style={{ width: 260 }}
            disabled={submitting}
          />
          <button
            type="button"
            onClick={submitCreate}
            disabled={submitting || newComment.trim().length === 0}
            className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center bg-gray-500/30 text-gray-400 disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-popover text-popover-foreground absolute z-40 w-80 shadow-lg"
      style={{
        left: Math.max(12, Math.min(window.innerWidth - 340, x + 42)),
        top: Math.max(12, Math.min(window.innerHeight - 380, y - 36)),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold">Comment</p>
        <div className="flex items-center gap-1">
          {thread && (
            <button
              type="button"
              onClick={() => onResolveToggle(thread.id)}
              className="flex h-7 w-7 items-center justify-center hover:bg-white/10"
              title={thread.resolved ? 'Unresolve' : 'Resolve'}
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-auto">
        {threadMessages.map((message) => (
          <div key={message.id} className="group relative px-4 py-2">
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center text-xs font-semibold">
                {message.author.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{message.author.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatRelativeTime(message.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{message.content}</p>
              </div>
              {message.userId === currentUserId && (
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                  onClick={() => onDelete(message.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {thread && (
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
          <div className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center text-xs font-semibold">
            {currentUserName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex flex-1 items-center bg-white/10">
            <input
              ref={replyInputRef}
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submitReply();
                }
              }}
              placeholder="Reply"
              className="flex-1 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-gray-500"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={submitReply}
              disabled={submitting || reply.trim().length === 0}
              className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center bg-gray-500/30 text-gray-400 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
