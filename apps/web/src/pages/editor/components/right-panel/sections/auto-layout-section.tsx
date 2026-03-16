import { useCallback } from 'react';
import {
  ArrowRight,
  ArrowDown,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Rows3,
  Columns3,
  X,
} from 'lucide-react';
import type { FrameShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

function PaddingIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="4" y="4" width="6" height="6" rx="0.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function GapIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="3" width="4" height="8" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="9" y="3" width="4" height="8" rx="0.5" fill="currentColor" opacity="0.3" />
      <line
        x1="7"
        y1="2"
        x2="7"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

export function AutoLayoutSection({ shape, onUpdate }: PropertySectionProps) {
  const frame = shape as FrameShape;
  const isActive = frame.layoutMode !== 'none';

  const toggleAutoLayout = useCallback(() => {
    if (isActive) {
      onUpdate({ layoutMode: 'none' } as Partial<Shape>);
    } else {
      onUpdate({
        layoutMode: 'vertical',
        layoutGap: 8,
        paddingTop: 8,
        paddingRight: 8,
        paddingBottom: 8,
        paddingLeft: 8,
      } as Partial<Shape>);
    }
  }, [isActive, onUpdate]);

  if (shape.type !== 'frame') return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={toggleAutoLayout}
          className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
        >
          Auto layout
        </button>
        {isActive ? (
          <button
            onClick={() => onUpdate({ layoutMode: 'none' } as Partial<Shape>)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={toggleAutoLayout}
            className="bg-muted hover:bg-muted/80 rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
          >
            Add
          </button>
        )}
      </div>

      {isActive && (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdate({ layoutMode: 'horizontal' } as Partial<Shape>)}
              className={`rounded p-1 transition-colors ${
                frame.layoutMode === 'horizontal'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Horizontal"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onUpdate({ layoutMode: 'vertical' } as Partial<Shape>)}
              className={`rounded p-1 transition-colors ${
                frame.layoutMode === 'vertical'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Vertical"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <div className="ml-auto w-16">
              <NumberInput
                label=""
                icon={<GapIcon className="h-3.5 w-3.5" />}
                value={frame.layoutGap}
                onChange={(v) => onUpdate({ layoutGap: v } as Partial<Shape>)}
                min={0}
                step={1}
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[10px]">Align</span>
            <div className="ml-auto flex items-center gap-0.5">
              {frame.layoutMode === 'horizontal' ? (
                <>
                  <AlignBtn
                    active={frame.layoutAlign === 'start'}
                    onClick={() => onUpdate({ layoutAlign: 'start' } as Partial<Shape>)}
                    title="Top"
                  >
                    <AlignStartVertical className="h-3.5 w-3.5" />
                  </AlignBtn>
                  <AlignBtn
                    active={frame.layoutAlign === 'center'}
                    onClick={() => onUpdate({ layoutAlign: 'center' } as Partial<Shape>)}
                    title="Center"
                  >
                    <AlignCenterVertical className="h-3.5 w-3.5" />
                  </AlignBtn>
                  <AlignBtn
                    active={frame.layoutAlign === 'end'}
                    onClick={() => onUpdate({ layoutAlign: 'end' } as Partial<Shape>)}
                    title="Bottom"
                  >
                    <AlignEndVertical className="h-3.5 w-3.5" />
                  </AlignBtn>
                </>
              ) : (
                <>
                  <AlignBtn
                    active={frame.layoutAlign === 'start'}
                    onClick={() => onUpdate({ layoutAlign: 'start' } as Partial<Shape>)}
                    title="Left"
                  >
                    <AlignStartHorizontal className="h-3.5 w-3.5" />
                  </AlignBtn>
                  <AlignBtn
                    active={frame.layoutAlign === 'center'}
                    onClick={() => onUpdate({ layoutAlign: 'center' } as Partial<Shape>)}
                    title="Center"
                  >
                    <AlignCenterHorizontal className="h-3.5 w-3.5" />
                  </AlignBtn>
                  <AlignBtn
                    active={frame.layoutAlign === 'end'}
                    onClick={() => onUpdate({ layoutAlign: 'end' } as Partial<Shape>)}
                    title="Right"
                  >
                    <AlignEndHorizontal className="h-3.5 w-3.5" />
                  </AlignBtn>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-[10px]">Justify</span>
            <div className="ml-auto flex items-center gap-0.5">
              <AlignBtn
                active={frame.layoutJustify === 'start'}
                onClick={() => onUpdate({ layoutJustify: 'start' } as Partial<Shape>)}
                title="Start"
              >
                {frame.layoutMode === 'horizontal' ? (
                  <AlignStartHorizontal className="h-3.5 w-3.5" />
                ) : (
                  <AlignStartVertical className="h-3.5 w-3.5" />
                )}
              </AlignBtn>
              <AlignBtn
                active={frame.layoutJustify === 'center'}
                onClick={() => onUpdate({ layoutJustify: 'center' } as Partial<Shape>)}
                title="Center"
              >
                {frame.layoutMode === 'horizontal' ? (
                  <AlignCenterHorizontal className="h-3.5 w-3.5" />
                ) : (
                  <AlignCenterVertical className="h-3.5 w-3.5" />
                )}
              </AlignBtn>
              <AlignBtn
                active={frame.layoutJustify === 'space_between'}
                onClick={() => onUpdate({ layoutJustify: 'space_between' } as Partial<Shape>)}
                title="Space between"
              >
                {frame.layoutMode === 'horizontal' ? (
                  <Columns3 className="h-3.5 w-3.5" />
                ) : (
                  <Rows3 className="h-3.5 w-3.5" />
                )}
              </AlignBtn>
            </div>
          </div>

          <div>
            <div className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px]">
              <PaddingIcon className="h-3 w-3" />
              Padding
            </div>
            <div className="grid grid-cols-4 gap-1">
              <NumberInput
                label="T"
                value={frame.paddingTop}
                onChange={(v) => onUpdate({ paddingTop: v } as Partial<Shape>)}
                min={0}
                step={1}
              />
              <NumberInput
                label="R"
                value={frame.paddingRight}
                onChange={(v) => onUpdate({ paddingRight: v } as Partial<Shape>)}
                min={0}
                step={1}
              />
              <NumberInput
                label="B"
                value={frame.paddingBottom}
                onChange={(v) => onUpdate({ paddingBottom: v } as Partial<Shape>)}
                min={0}
                step={1}
              />
              <NumberInput
                label="L"
                value={frame.paddingLeft}
                onChange={(v) => onUpdate({ paddingLeft: v } as Partial<Shape>)}
                min={0}
                step={1}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AlignBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded p-1 transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  );
}
