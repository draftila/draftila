import type { Shape } from '@draftila/shared';
import { getShape } from '@draftila/engine/scene-graph';
import { isAutoLayoutFrame } from '@draftila/engine/auto-layout';
import type { PropertySectionProps } from '../types';

type ConstraintHorizontal = 'left' | 'right' | 'left-right' | 'center' | 'scale';
type ConstraintVertical = 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale';
type SizingMode = 'fixed' | 'hug' | 'fill';

interface ConstraintShapeData {
  constraintHorizontal?: ConstraintHorizontal;
  constraintVertical?: ConstraintVertical;
}

interface SizingShapeData {
  layoutSizingHorizontal?: SizingMode;
  layoutSizingVertical?: SizingMode;
}

const HORIZONTAL_OPTIONS: Array<{ value: ConstraintHorizontal; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'left-right', label: 'Left & Right' },
  { value: 'center', label: 'Center' },
  { value: 'scale', label: 'Scale' },
];

const VERTICAL_OPTIONS: Array<{ value: ConstraintVertical; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'center', label: 'Center' },
  { value: 'scale', label: 'Scale' },
];

const SIZING_OPTIONS: Array<{ value: SizingMode; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'fill', label: 'Fill' },
];

const SIZING_OPTIONS_WITH_HUG: Array<{ value: SizingMode; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'fill', label: 'Fill' },
  { value: 'hug', label: 'Hug' },
];

export function ConstraintsSection({ ydoc, shape, onUpdate }: PropertySectionProps) {
  const parentId = shape.parentId;
  if (!parentId) return null;

  const parent = getShape(ydoc, parentId);
  if (!parent || parent.type !== 'frame') return null;

  if (isAutoLayoutFrame(parent)) {
    return <ResizingControls shape={shape} onUpdate={onUpdate} />;
  }

  return <ConstraintControls shape={shape} onUpdate={onUpdate} />;
}

function ResizingControls({
  shape,
  onUpdate,
}: {
  shape: Shape;
  onUpdate: (props: Partial<Shape>) => void;
}) {
  const withSizing = shape as Shape & SizingShapeData;
  const horizontal = withSizing.layoutSizingHorizontal ?? 'fixed';
  const vertical = withSizing.layoutSizingVertical ?? 'fixed';
  const canHug = shape.type === 'frame';
  const options = canHug ? SIZING_OPTIONS_WITH_HUG : SIZING_OPTIONS;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium">Resizing</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-muted-foreground text-[10px]">
          Horizontal
          <select
            value={horizontal}
            onChange={(e) =>
              onUpdate({ layoutSizingHorizontal: e.target.value as SizingMode } as Partial<Shape>)
            }
            className="border-input mt-1 h-7 w-full rounded border bg-transparent px-2 text-[11px]"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground text-[10px]">
          Vertical
          <select
            value={vertical}
            onChange={(e) =>
              onUpdate({ layoutSizingVertical: e.target.value as SizingMode } as Partial<Shape>)
            }
            className="border-input mt-1 h-7 w-full rounded border bg-transparent px-2 text-[11px]"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function ConstraintControls({
  shape,
  onUpdate,
}: {
  shape: Shape;
  onUpdate: (props: Partial<Shape>) => void;
}) {
  const withConstraints = shape as Shape & ConstraintShapeData;
  const horizontal = withConstraints.constraintHorizontal ?? 'left';
  const vertical = withConstraints.constraintVertical ?? 'top';

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium">Constraints</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-muted-foreground text-[10px]">
          Horizontal
          <select
            value={horizontal}
            onChange={(event) =>
              onUpdate({
                constraintHorizontal: event.target.value as ConstraintHorizontal,
              } as Partial<Shape>)
            }
            className="border-input mt-1 h-7 w-full rounded border bg-transparent px-2 text-[11px]"
          >
            {HORIZONTAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground text-[10px]">
          Vertical
          <select
            value={vertical}
            onChange={(event) =>
              onUpdate({
                constraintVertical: event.target.value as ConstraintVertical,
              } as Partial<Shape>)
            }
            className="border-input mt-1 h-7 w-full rounded border bg-transparent px-2 text-[11px]"
          >
            {VERTICAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
