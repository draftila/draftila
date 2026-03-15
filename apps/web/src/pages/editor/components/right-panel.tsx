import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getShape, updateShape, observeShapes } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import { getSectionsForShape } from './right-panel/section-registry';
import { ZoomControls } from './right-panel/zoom-controls';

interface RightPanelProps {
  ydoc: Y.Doc;
}

export function RightPanel({ ydoc }: RightPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const rightPanelOpen = useEditorStore((s) => s.rightPanelOpen);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (selectedIds.length === 1) {
      setSelectedShape(getShape(ydoc, selectedIds[0]!));
    } else {
      setSelectedShape(null);
    }
  }, [selectedIds, ydoc, revision]);

  useEffect(() => {
    const unobserve = observeShapes(ydoc, () => {
      setRevision((r) => r + 1);
    });
    return unobserve;
  }, [ydoc]);

  const handleUpdate = useCallback(
    (props: Partial<Shape>) => {
      if (selectedIds.length !== 1) return;
      updateShape(ydoc, selectedIds[0]!, props);
    },
    [ydoc, selectedIds],
  );

  if (!rightPanelOpen) return null;

  const sections = selectedShape ? getSectionsForShape(selectedShape.type) : [];

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-l">
      <ZoomControls />
      <div className="flex-1 overflow-auto">
        {!selectedShape && (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
            Select an element
          </div>
        )}
        {selectedShape && (
          <div>
            {sections.map((Section, index) => (
              <div key={Section.name || index} className="border-b px-3 py-3">
                <Section shape={selectedShape} onUpdate={handleUpdate} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
