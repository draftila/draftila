import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  maxLength?: number;
}

export function InlineEditableText({
  value,
  onSave,
  className,
  inputClassName,
  maxLength = 255,
}: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          'hover:bg-accent truncate rounded-sm px-1.5 py-0.5 text-left transition-colors',
          className,
        )}
        onClick={() => setEditing(true)}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      maxLength={maxLength}
      className={cn(
        'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-auto rounded-sm border bg-transparent px-1.5 py-0.5 text-sm font-medium outline-none focus-visible:ring-1',
        inputClassName,
      )}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
    />
  );
}
