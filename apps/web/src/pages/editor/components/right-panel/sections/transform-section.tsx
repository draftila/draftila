import { useCallback, useState } from 'react';
import type { Shape } from '@draftila/shared';
import { flipShapes } from '@draftila/engine/scene-graph';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

function FlipHorizontalIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M7 1v12" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
      <path d="M4 4L1 7l3 3V4z" fill="currentColor" />
      <path d="M10 4l3 3-3 3V4z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function FlipVerticalIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M1 7h12" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
      <path d="M4 4L7 1l3 3H4z" fill="currentColor" />
      <path d="M4 10l3 3 3-3H4z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      width="10"
      height="14"
      viewBox="0 0 10 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1 4V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M1 10v1a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1M5 4v6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UnlinkIcon({ className }: { className?: string }) {
  return (
    <svg
      width="10"
      height="14"
      viewBox="0 0 10 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1 4V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M1 10v1a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TransformSection({ ydoc, shape, onUpdate }: PropertySectionProps) {
  const [constrained, setConstrained] = useState(false);
  const aspectRatio = shape.width > 0 ? shape.height / shape.width : 1;

  const handleWidthChange = useCallback(
    (v: number) => {
      if (constrained && shape.width > 0) {
        onUpdate({ width: v, height: Math.round(v * aspectRatio) } as Partial<Shape>);
      } else {
        onUpdate({ width: v } as Partial<Shape>);
      }
    },
    [constrained, aspectRatio, shape.width, onUpdate],
  );

  const handleHeightChange = useCallback(
    (v: number) => {
      if (constrained && shape.height > 0) {
        onUpdate({
          width: Math.round(v / aspectRatio),
          height: v,
        } as Partial<Shape>);
      } else {
        onUpdate({ height: v } as Partial<Shape>);
      }
    },
    [constrained, aspectRatio, shape.height, onUpdate],
  );

  const handleFlipH = useCallback(() => {
    flipShapes(ydoc, [shape.id], 'horizontal');
  }, [ydoc, shape.id]);

  const handleFlipV = useCallback(() => {
    flipShapes(ydoc, [shape.id], 'vertical');
  }, [ydoc, shape.id]);

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Transform</h4>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="X"
          value={shape.x}
          onChange={(v) => onUpdate({ x: v } as Partial<Shape>)}
        />
        <NumberInput
          label="Y"
          value={shape.y}
          onChange={(v) => onUpdate({ y: v } as Partial<Shape>)}
        />
        <NumberInput label="W" value={shape.width} onChange={handleWidthChange} />
        <NumberInput label="H" value={shape.height} onChange={handleHeightChange} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex-1">
          <NumberInput
            label="R"
            value={shape.rotation}
            onChange={(v) => onUpdate({ rotation: v } as Partial<Shape>)}
            step={15}
          />
        </div>
        <button
          type="button"
          onClick={() => setConstrained(!constrained)}
          className={`shrink-0 rounded p-1 transition-colors ${
            constrained
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={constrained ? 'Unlock proportions' : 'Lock proportions'}
        >
          {constrained ? (
            <LinkIcon className="h-3.5 w-3.5" />
          ) : (
            <UnlinkIcon className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleFlipH}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors"
          title="Flip horizontal (⇧H)"
        >
          <FlipHorizontalIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleFlipV}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 transition-colors"
          title="Flip vertical (⇧V)"
        >
          <FlipVerticalIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
