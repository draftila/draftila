import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const EW_RESIZE_CURSOR = (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 20 20" fill="none">
    <path
      d="M14 10L11 7V9H9V7L6 10L9 13V11H11V13L14 10Z"
      fill="black"
      stroke="white"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

interface NumberInputProps {
  label: string;
  icon?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: ReactNode;
  dragSensitivity?: number;
  borderless?: boolean;
}

export function NumberInput({
  label,
  icon,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  dragSensitivity = 1,
  borderless = false,
}: NumberInputProps) {
  value = isNaN(value) ? 0 : value;
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
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

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const target = e.currentTarget;

      dragValueRef.current = value;
      accumulatorRef.current = 0;
      setCursorPos({ x: e.clientX, y: e.clientY });
      setIsDragging(true);

      document.body.style.cursor = 'none';

      const stopDragging = () => {
        if (document.pointerLockElement === target) {
          document.exitPointerLock();
        }
        document.body.style.cursor = '';
        setIsDragging(false);
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('mouseup', stopDragging);
        document.removeEventListener('pointerlockchange', handlePointerLockChange);
      };

      const handlePointerMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.movementX * dragSensitivity;
        accumulatorRef.current += delta;

        const viewportWidth = window.innerWidth;
        if (viewportWidth > 0) {
          setCursorPos((prev) => {
            const wrappedX =
              (((prev.x + moveEvent.movementX) % viewportWidth) + viewportWidth) % viewportWidth;
            return { x: wrappedX, y: prev.y };
          });
        }

        const steppedDelta = Math.trunc(accumulatorRef.current / step) * step;
        if (steppedDelta !== 0) {
          accumulatorRef.current -= steppedDelta;
          dragValueRef.current = clamp(
            Math.round((dragValueRef.current + steppedDelta) * 1000) / 1000,
          );
          onChange(dragValueRef.current);
        }
      };

      const handlePointerLockChange = () => {
        if (document.pointerLockElement !== target) {
          document.body.style.cursor = '';
          setIsDragging(false);
          document.removeEventListener('mousemove', handlePointerMove);
          document.removeEventListener('mouseup', stopDragging);
          document.removeEventListener('pointerlockchange', handlePointerLockChange);
        }
      };

      target.requestPointerLock();
      document.addEventListener('mousemove', handlePointerMove);
      document.addEventListener('mouseup', stopDragging);
      document.addEventListener('pointerlockchange', handlePointerLockChange);
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
    <>
      <div
        className={cn(
          'flex h-6 items-center transition-colors',
          !borderless && 'border-input rounded-md border',
          !borderless && 'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-1',
          !borderless && isDragging && 'border-ring ring-ring/50 ring-1',
        )}
      >
        {(label || icon) && (
          <span
            onPointerDown={handlePointerDown}
            className={cn(
              'text-muted-foreground flex h-full shrink-0 cursor-ew-resize select-none items-center text-[11px]',
              !borderless && 'pl-1.5 pr-1.5',
              borderless && 'pr-1',
              isDragging && 'text-foreground',
            )}
          >
            {icon ?? label}
          </span>
        )}
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
      {isDragging &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999]"
            style={{ left: cursorPos.x - 14, top: cursorPos.y - 14 }}
          >
            {EW_RESIZE_CURSOR}
          </div>,
          document.body,
        )}
    </>
  );
}
