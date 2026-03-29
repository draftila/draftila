import type { Shape } from '@draftila/shared';
import { InspectSection } from './inspect-section';
import { InspectPropertyRow } from './inspect-property-row';

type FrameShape = Shape & {
  layoutMode: string;
  layoutWrap: string;
  layoutGap: number;
  layoutGapColumn: number;
  layoutAlign: string;
  layoutJustify: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
};

function formatPadding(t: number, r: number, b: number, l: number): string {
  if (t === r && r === b && b === l) return `${t}`;
  if (t === b && r === l) return `${t} ${r}`;
  return `${t} ${r} ${b} ${l}`;
}

function formatDirection(mode: string): string {
  if (mode === 'horizontal') return 'Row';
  if (mode === 'vertical') return 'Column';
  return 'None';
}

function formatJustify(justify: string): string {
  return justify.replace('_', ' ');
}

export function InspectLayout({ shape }: { shape: Shape }) {
  if (shape.type !== 'frame') return null;
  const frame = shape as FrameShape;
  if (frame.layoutMode === 'none') return null;

  const padding = formatPadding(
    frame.paddingTop,
    frame.paddingRight,
    frame.paddingBottom,
    frame.paddingLeft,
  );
  const hasPadding =
    frame.paddingTop > 0 ||
    frame.paddingRight > 0 ||
    frame.paddingBottom > 0 ||
    frame.paddingLeft > 0;

  return (
    <InspectSection title="Auto Layout">
      <InspectPropertyRow label="Direction" value={formatDirection(frame.layoutMode)} />
      {frame.layoutWrap !== 'nowrap' && (
        <InspectPropertyRow label="Wrap" value={frame.layoutWrap} />
      )}
      <InspectPropertyRow label="Gap" value={`${frame.layoutGap}`} />
      {frame.layoutWrap === 'wrap' && frame.layoutGapColumn > 0 && (
        <InspectPropertyRow label="Column Gap" value={`${frame.layoutGapColumn}`} />
      )}
      {hasPadding && <InspectPropertyRow label="Padding" value={padding} />}
      <InspectPropertyRow label="Align" value={frame.layoutAlign} />
      <InspectPropertyRow label="Justify" value={formatJustify(frame.layoutJustify)} />
      <div className="mt-2">
        <BoxModelDiagram
          width={Math.round(shape.width)}
          height={Math.round(shape.height)}
          paddingTop={frame.paddingTop}
          paddingRight={frame.paddingRight}
          paddingBottom={frame.paddingBottom}
          paddingLeft={frame.paddingLeft}
        />
      </div>
    </InspectSection>
  );
}

function BoxModelDiagram({
  width,
  height,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
}: {
  width: number;
  height: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}) {
  const hasPadding = paddingTop > 0 || paddingRight > 0 || paddingBottom > 0 || paddingLeft > 0;

  return (
    <div className="border-border rounded border p-1.5">
      <div className="relative flex flex-col items-center rounded border border-blue-500/30 bg-blue-500/10 px-1 py-1">
        {hasPadding && paddingTop > 0 && (
          <span className="text-[9px] text-blue-400">{paddingTop}</span>
        )}
        <div className="flex w-full items-center justify-center gap-1">
          {hasPadding && paddingLeft > 0 && (
            <span className="text-[9px] text-blue-400">{paddingLeft}</span>
          )}
          <div className="flex min-h-[24px] flex-1 items-center justify-center rounded border border-emerald-500/30 bg-emerald-500/10">
            <span className="text-muted-foreground text-[9px]">
              {width} × {height}
            </span>
          </div>
          {hasPadding && paddingRight > 0 && (
            <span className="text-[9px] text-blue-400">{paddingRight}</span>
          )}
        </div>
        {hasPadding && paddingBottom > 0 && (
          <span className="text-[9px] text-blue-400">{paddingBottom}</span>
        )}
      </div>
    </div>
  );
}
