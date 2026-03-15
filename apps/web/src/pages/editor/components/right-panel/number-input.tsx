import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: ReactNode;
  dragSensitivity?: number;
}

export function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  dragSensitivity = 1,
}: NumberInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragValueRef = useRef(value);
  const accumulatorRef = useRef(0);

  const clamp = useCallback(
    (v: number) => {
      let result = v;
      if (min !== undefined) result = Math.max(min, result);
      if (max !== undefined) result = Math.min(max, result);
      return result;
    },
    [min, max],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const target = e.currentTarget;

      dragValueRef.current = value;
      accumulatorRef.current = 0;
      setIsDragging(true);

      target.requestPointerLock();

      const handlePointerMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.movementX * dragSensitivity;
        accumulatorRef.current += delta;

        const steppedDelta = Math.trunc(accumulatorRef.current / step) * step;
        if (steppedDelta !== 0) {
          accumulatorRef.current -= steppedDelta;
          dragValueRef.current = clamp(
            Math.round((dragValueRef.current + steppedDelta) * 1000) / 1000,
          );
          onChange(dragValueRef.current);
        }
      };

      const handlePointerUp = () => {
        document.exitPointerLock();
        setIsDragging(false);
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);
      };

      document.addEventListener('mousemove', handlePointerMove);
      document.addEventListener('mouseup', handlePointerUp);
    },
    [value, onChange, step, clamp, dragSensitivity],
  );

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditValue(String(Math.round(value * 100) / 100));
    requestAnimationFrame(() => inputRef.current?.select());
  }, [value]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed));
    }
  }, [editValue, onChange, clamp]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        inputRef.current?.blur();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onChange(clamp(Math.round((value + step) * 1000) / 1000));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onChange(clamp(Math.round((value - step) * 1000) / 1000));
      }
    },
    [commitEdit, onChange, value, step, clamp],
  );

  const displayValue = Math.round(value * 100) / 100;

  return (
    <div
      className={cn(
        'border-input flex h-6 items-center rounded-md border transition-colors',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-1',
        isDragging && 'border-ring ring-ring/50 ring-1',
      )}
    >
      <span
        onPointerDown={handlePointerDown}
        className={cn(
          'text-muted-foreground flex h-full shrink-0 cursor-ew-resize select-none items-center pl-1.5 pr-1.5 text-[11px]',
          isDragging && 'text-foreground',
        )}
      >
        {label}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="flex h-full min-w-0 flex-1 items-center text-left font-mono text-[11px] outline-none"
        >
          <span className="truncate">{displayValue}</span>
        </button>
      )}
      {suffix && (
        <span className="text-muted-foreground flex h-full shrink-0 items-center pr-1.5 text-[11px]">
          {suffix}
        </span>
      )}
    </div>
  );
}
