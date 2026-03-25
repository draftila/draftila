import { useCallback } from 'react';
import type { TextShape, TextSegment, Shape } from '@draftila/shared';
import { Bold, Italic, Minus, Plus, SplitSquareHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '../../color-picker';
import { NumberInput } from '../number-input';

export function SegmentsEditor({
  shape,
  onUpdate,
}: {
  shape: TextShape;
  onUpdate: (props: Partial<Shape>) => void;
}) {
  const segments = shape.segments;
  const hasSegments = segments && segments.length > 0;

  const enableSegments = useCallback(() => {
    const content = shape.content || 'Text';
    onUpdate({
      segments: [{ text: content }],
      content,
    } as Partial<Shape>);
  }, [shape.content, onUpdate]);

  const disableSegments = useCallback(() => {
    onUpdate({ segments: undefined } as unknown as Partial<Shape>);
  }, [onUpdate]);

  const updateSegment = useCallback(
    (index: number, patch: Partial<TextSegment>) => {
      if (!segments) return;
      const next = segments.map((s, i) => (i === index ? { ...s, ...patch } : s));
      const content = next.map((s) => s.text).join('');
      onUpdate({ segments: next, content } as Partial<Shape>);
    },
    [segments, onUpdate],
  );

  const addSegment = useCallback(() => {
    if (!segments) return;
    const next = [...segments, { text: 'text' }];
    const content = next.map((s) => s.text).join('');
    onUpdate({ segments: next, content } as Partial<Shape>);
  }, [segments, onUpdate]);

  const removeSegment = useCallback(
    (index: number) => {
      if (!segments || segments.length <= 1) return;
      const next = segments.filter((_, i) => i !== index);
      const content = next.map((s) => s.text).join('');
      onUpdate({ segments: next, content } as Partial<Shape>);
    },
    [segments, onUpdate],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-muted-foreground text-[11px] font-medium">Rich Text</h4>
        <button
          onClick={hasSegments ? disableSegments : enableSegments}
          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            hasSegments
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <SplitSquareHorizontal className="inline h-3 w-3" />
        </button>
      </div>

      {hasSegments && (
        <div className="space-y-2">
          {segments.map((segment, index) => (
            <SegmentRow
              key={index}
              segment={segment}
              onUpdate={(patch) => updateSegment(index, patch)}
              onRemove={() => removeSegment(index)}
              canRemove={segments.length > 1}
            />
          ))}
          <button
            onClick={addSegment}
            className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Add segment</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentRow({
  segment,
  onUpdate,
  onRemove,
  canRemove,
}: {
  segment: TextSegment;
  onUpdate: (patch: Partial<TextSegment>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const color = segment.color ?? '#000000';

  return (
    <div className="border-border space-y-1 rounded border p-1.5">
      <div className="flex items-center gap-1">
        <input
          value={segment.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          className="border-input min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
          placeholder="Segment text"
        />
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <ColorPicker
          color={color}
          opacity={1}
          onChange={(c) => onUpdate({ color: c })}
          onOpacityChange={() => {}}
        >
          <button
            className="border-border h-5 w-5 shrink-0 rounded border"
            style={{ backgroundColor: color }}
          />
        </ColorPicker>
        <Button
          variant={segment.fontWeight === 700 ? 'default' : 'outline'}
          size="icon"
          className="h-5 w-5"
          onClick={() => onUpdate({ fontWeight: segment.fontWeight === 700 ? undefined : 700 })}
        >
          <Bold className="h-2.5 w-2.5" />
        </Button>
        <Button
          variant={segment.fontStyle === 'italic' ? 'default' : 'outline'}
          size="icon"
          className="h-5 w-5"
          onClick={() =>
            onUpdate({ fontStyle: segment.fontStyle === 'italic' ? undefined : 'italic' })
          }
        >
          <Italic className="h-2.5 w-2.5" />
        </Button>
        {segment.fontSize !== undefined && (
          <div className="w-12">
            <NumberInput
              label=""
              value={segment.fontSize}
              onChange={(v) => onUpdate({ fontSize: v })}
              min={1}
            />
          </div>
        )}
      </div>
    </div>
  );
}
