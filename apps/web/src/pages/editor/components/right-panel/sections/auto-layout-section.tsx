import { useCallback } from 'react';
import { ArrowRight, ArrowDown, WrapText, X } from 'lucide-react';
import type { FrameShape, LayoutAlign, LayoutJustify, Shape } from '@draftila/shared';
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

function CrossGapIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="1" width="8" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
      <rect x="3" y="9" width="8" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
      <line
        x1="2"
        y1="7"
        x2="12"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

type SizingMode = 'fixed' | 'hug' | 'fill';

const SIZING_OPTIONS: Array<{ value: SizingMode; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hug', label: 'Hug' },
];

const JUSTIFY_ALIGN_MAP_H: Array<{ align: LayoutAlign; justify: LayoutJustify }> = [
  { align: 'start', justify: 'start' },
  { align: 'start', justify: 'center' },
  { align: 'start', justify: 'end' },
  { align: 'center', justify: 'start' },
  { align: 'center', justify: 'center' },
  { align: 'center', justify: 'end' },
  { align: 'end', justify: 'start' },
  { align: 'end', justify: 'center' },
  { align: 'end', justify: 'end' },
];

const JUSTIFY_ALIGN_MAP_V: Array<{ align: LayoutAlign; justify: LayoutJustify }> = [
  { align: 'start', justify: 'start' },
  { align: 'center', justify: 'start' },
  { align: 'end', justify: 'start' },
  { align: 'start', justify: 'center' },
  { align: 'center', justify: 'center' },
  { align: 'end', justify: 'center' },
  { align: 'start', justify: 'end' },
  { align: 'center', justify: 'end' },
  { align: 'end', justify: 'end' },
];

export function AutoLayoutSection({ shape, onUpdate }: PropertySectionProps) {
  const frame = shape as FrameShape;
  const isActive = frame.layoutMode !== 'none';

  const toggleAutoLayout = useCallback(() => {
    if (isActive) {
      onUpdate({ layoutMode: 'none' } as Partial<Shape>);
    } else {
      onUpdate({
        layoutMode: 'vertical',
        layoutWrap: 'nowrap',
        layoutGap: 8,
        layoutGapColumn: 0,
        paddingTop: 8,
        paddingRight: 8,
        paddingBottom: 8,
        paddingLeft: 8,
      } as Partial<Shape>);
    }
  }, [isActive, onUpdate]);

  if (shape.type !== 'frame') return null;

  const isHorizontal = frame.layoutMode === 'horizontal';
  const isWrap = (frame as Record<string, unknown>).layoutWrap === 'wrap';

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
            <DirectionBtn
              active={frame.layoutMode === 'horizontal'}
              onClick={() => onUpdate({ layoutMode: 'horizontal' } as Partial<Shape>)}
              title="Horizontal"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </DirectionBtn>
            <DirectionBtn
              active={frame.layoutMode === 'vertical'}
              onClick={() => onUpdate({ layoutMode: 'vertical' } as Partial<Shape>)}
              title="Vertical"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </DirectionBtn>
            <DirectionBtn
              active={isWrap}
              onClick={() =>
                onUpdate({
                  layoutWrap: isWrap ? 'nowrap' : 'wrap',
                  layoutGapColumn: isWrap
                    ? 0
                    : ((frame as Record<string, unknown>).layoutGapColumn as number) ||
                      frame.layoutGap,
                } as Partial<Shape>)
              }
              title={isWrap ? 'Disable wrap' : 'Enable wrap'}
            >
              <WrapText className="h-3.5 w-3.5" />
            </DirectionBtn>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <SizingSelect
              label="W"
              value={(frame.layoutSizingHorizontal ?? 'fixed') as SizingMode}
              onChange={(v) => onUpdate({ layoutSizingHorizontal: v } as Partial<Shape>)}
            />
            <SizingSelect
              label="H"
              value={(frame.layoutSizingVertical ?? 'fixed') as SizingMode}
              onChange={(v) => onUpdate({ layoutSizingVertical: v } as Partial<Shape>)}
            />
          </div>

          <div className="flex items-start gap-2">
            <AlignmentGrid
              isHorizontal={isHorizontal}
              layoutAlign={(frame.layoutAlign ?? 'start') as LayoutAlign}
              layoutJustify={(frame.layoutJustify ?? 'start') as LayoutJustify}
              onUpdate={onUpdate}
            />
            <div className="flex flex-1 flex-col gap-1">
              <NumberInput
                label=""
                icon={<GapIcon className="h-3.5 w-3.5" />}
                value={frame.layoutGap}
                onChange={(v) => onUpdate({ layoutGap: v } as Partial<Shape>)}
                min={0}
                step={1}
              />
              {isWrap && (
                <NumberInput
                  label=""
                  icon={<CrossGapIcon className="h-3.5 w-3.5" />}
                  value={((frame as Record<string, unknown>).layoutGapColumn as number) ?? 0}
                  onChange={(v) => onUpdate({ layoutGapColumn: v } as Partial<Shape>)}
                  min={0}
                  step={1}
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <JustifyBtn
              active={frame.layoutJustify === 'space_between'}
              onClick={() => onUpdate({ layoutJustify: 'space_between' } as Partial<Shape>)}
              title="Space between"
            >
              <SpaceBetweenIcon isHorizontal={isHorizontal} />
            </JustifyBtn>
            <JustifyBtn
              active={frame.layoutJustify === 'space_around'}
              onClick={() => onUpdate({ layoutJustify: 'space_around' } as Partial<Shape>)}
              title="Space around"
            >
              <SpaceAroundIcon isHorizontal={isHorizontal} />
            </JustifyBtn>
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

function DirectionBtn({
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

function SizingSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SizingMode;
  onChange: (v: SizingMode) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SizingMode)}
        className="border-input h-6 flex-1 rounded-md border bg-transparent px-1.5 text-[11px]"
      >
        {SIZING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AlignmentGrid({
  isHorizontal,
  layoutAlign,
  layoutJustify,
  onUpdate,
}: {
  isHorizontal: boolean;
  layoutAlign: LayoutAlign;
  layoutJustify: LayoutJustify;
  onUpdate: (props: Partial<Shape>) => void;
}) {
  const map = isHorizontal ? JUSTIFY_ALIGN_MAP_H : JUSTIFY_ALIGN_MAP_V;
  const isSpaceDistribution = layoutJustify === 'space_between' || layoutJustify === 'space_around';

  return (
    <div className="border-input grid h-[52px] w-[52px] shrink-0 grid-cols-3 grid-rows-3 gap-0 overflow-hidden rounded-md border">
      {map.map((cell, i) => {
        const isActive =
          !isSpaceDistribution && cell.align === layoutAlign && cell.justify === layoutJustify;

        return (
          <button
            key={i}
            onClick={() =>
              onUpdate({
                layoutAlign: cell.align,
                layoutJustify: cell.justify,
              } as Partial<Shape>)
            }
            className={`flex items-center justify-center transition-colors ${
              isActive ? 'bg-primary' : 'hover:bg-muted/80'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? 'bg-primary-foreground' : 'bg-muted-foreground/40'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function JustifyBtn({
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

function SpaceBetweenIcon({ isHorizontal }: { isHorizontal: boolean }) {
  if (isHorizontal) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="1" y="4" width="3" height="6" rx="0.5" fill="currentColor" />
        <rect x="10" y="4" width="3" height="6" rx="0.5" fill="currentColor" />
        <line x1="0.5" y1="1" x2="0.5" y2="13" stroke="currentColor" strokeWidth="1" />
        <line x1="13.5" y1="1" x2="13.5" y2="13" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="1" width="6" height="3" rx="0.5" fill="currentColor" />
      <rect x="4" y="10" width="6" height="3" rx="0.5" fill="currentColor" />
      <line x1="1" y1="0.5" x2="13" y2="0.5" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="13.5" x2="13" y2="13.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function SpaceAroundIcon({ isHorizontal }: { isHorizontal: boolean }) {
  if (isHorizontal) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="2" y="4" width="3" height="6" rx="0.5" fill="currentColor" />
        <rect x="9" y="4" width="3" height="6" rx="0.5" fill="currentColor" />
        <line
          x1="0.5"
          y1="1"
          x2="0.5"
          y2="13"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <line
          x1="13.5"
          y1="1"
          x2="13.5"
          y2="13"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="2" width="6" height="3" rx="0.5" fill="currentColor" />
      <rect x="4" y="9" width="6" height="3" rx="0.5" fill="currentColor" />
      <line
        x1="1"
        y1="0.5"
        x2="13"
        y2="0.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <line
        x1="1"
        y1="13.5"
        x2="13"
        y2="13.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
    </svg>
  );
}
