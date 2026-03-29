import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getAllShapes, getShape, observeShapes } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import { InspectTransform } from './inspect-transform';
import { InspectAppearance } from './inspect-appearance';
import { InspectFill } from './inspect-fill';
import { InspectStroke } from './inspect-stroke';
import { InspectTypography } from './inspect-typography';
import { InspectEffects } from './inspect-effects';
import { InspectLayout } from './inspect-layout';
import { InspectConstraints } from './inspect-constraints';
import { InspectCode } from './inspect-code';

interface InspectPanelProps {
  ydoc: Y.Doc;
}

const SHAPE_TYPE_LABELS: Record<string, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  frame: 'Frame',
  text: 'Text',
  path: 'Path',
  line: 'Line',
  polygon: 'Polygon',
  star: 'Star',
  image: 'Image',
  svg: 'SVG',
  group: 'Group',
};

function hasFills(shape: Shape): boolean {
  return 'fills' in shape;
}

function hasStrokes(shape: Shape): boolean {
  return 'strokes' in shape;
}

type InspectTab = 'list' | 'code';

export function InspectPanel({ ydoc }: InspectPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<InspectTab>('list');

  useEffect(() => {
    return observeShapes(ydoc, () => setRevision((r) => r + 1));
  }, [ydoc]);

  const shapes = selectedIds.map((id) => getShape(ydoc, id)).filter((s): s is Shape => s !== null);

  void revision;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <TabButton active={activeTab === 'list'} onClick={() => setActiveTab('list')}>
          List
        </TabButton>
        <TabButton active={activeTab === 'code'} onClick={() => setActiveTab('code')}>
          Code
        </TabButton>
      </div>
      {activeTab === 'code' ? (
        <InspectCode ydoc={ydoc} shapes={shapes} />
      ) : (
        <InspectListView shapes={shapes} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function InspectListView({ shapes }: { shapes: Shape[] }) {
  if (shapes.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-muted-foreground text-[11px]">
          Select a layer to inspect its properties
        </p>
      </div>
    );
  }

  if (shapes.length > 1) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs font-medium">{shapes.length} layers selected</p>
        <div className="mt-2">
          {shapes.map((shape) => (
            <SingleShapeInspect key={shape.id} shape={shape} />
          ))}
        </div>
      </div>
    );
  }

  const shape = shapes[0]!;

  return (
    <div>
      <div className="border-b px-3 py-2">
        <p className="text-[11px] font-medium">
          {shape.name || SHAPE_TYPE_LABELS[shape.type] || shape.type}
        </p>
        <p className="text-muted-foreground text-[10px]">{SHAPE_TYPE_LABELS[shape.type]}</p>
      </div>
      <InspectTransform shape={shape} />
      <InspectAppearance shape={shape} />
      {shape.type === 'frame' && <InspectLayout shape={shape} />}
      {shape.type === 'text' && <InspectTypography shape={shape} />}
      {hasFills(shape) && <InspectFill shape={shape} />}
      {hasStrokes(shape) && <InspectStroke shape={shape} />}
      <InspectEffects shape={shape} />
      <InspectConstraints shape={shape} />
    </div>
  );
}

function SingleShapeInspect({ shape }: { shape: Shape }) {
  return (
    <div className="border-b py-1.5">
      <p className="text-[11px] font-medium">{shape.name || SHAPE_TYPE_LABELS[shape.type]}</p>
      <p className="text-muted-foreground text-[10px]">
        {Math.round(shape.width)} × {Math.round(shape.height)}
      </p>
    </div>
  );
}
