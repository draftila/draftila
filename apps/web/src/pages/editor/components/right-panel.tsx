import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  getAllShapes,
  getExpandedShapeIds,
  getShape,
  observeShapes,
} from '@draftila/engine/scene-graph';
import { getComponentById, getInstanceComponentId, observeComponents } from '@draftila/engine';
import {
  opUpdateShape,
  opBatchUpdateShapes,
  opAlignShapes,
  opDistributeShapes,
} from '@draftila/engine/operations';
import {
  getPageBackgroundColor,
  setPageBackgroundColor,
  observePages,
  DEFAULT_PAGE_BACKGROUND,
} from '@draftila/engine';
import { useEditorStore } from '@/stores/editor-store';

import { filterEffectivelyVisibleShapes, createCanvasScopeShape } from './right-panel-utils';
import { RightPanelCanvas } from './right-panel-canvas';
import { RightPanelMultiSelect } from './right-panel-multi-select';
import { getSectionsForShape } from './right-panel/section-registry';
import { ZoomControls } from './right-panel/zoom-controls';
import { VersionHistoryPanel } from './version-history-panel';
import { InspectPanel } from './inspect-panel';

interface RightPanelProps {
  ydoc: Y.Doc;
  draftId: string;
}

export function RightPanel({ ydoc, draftId }: RightPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const activePageId = useEditorStore((s) => s.activePageId);
  const rightPanelOpen = useEditorStore((s) => s.rightPanelOpen);
  const devMode = useEditorStore((s) => s.devMode);
  const versionHistoryOpen = useEditorStore((s) => s.versionHistoryOpen);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [instanceLabel, setInstanceLabel] = useState<string | null>(null);
  const [shapeScope, setShapeScope] = useState<Shape[]>([]);
  const [canvasShape, setCanvasShape] = useState<Shape>(createCanvasScopeShape([]));
  const [revision, setRevision] = useState(0);
  const [pageBgColor, setPageBgColor] = useState(DEFAULT_PAGE_BACKGROUND);

  useEffect(() => {
    setPageBgColor(
      activePageId ? getPageBackgroundColor(ydoc, activePageId) : DEFAULT_PAGE_BACKGROUND,
    );

    return observePages(ydoc, () => {
      const currentPageId = useEditorStore.getState().activePageId;
      setPageBgColor(
        currentPageId ? getPageBackgroundColor(ydoc, currentPageId) : DEFAULT_PAGE_BACKGROUND,
      );
    });
  }, [ydoc, activePageId]);

  const handlePageBgColorChange = useCallback(
    (color: string) => {
      if (!activePageId) return;
      setPageBackgroundColor(ydoc, activePageId, color);
      setPageBgColor(color);
    },
    [ydoc, activePageId],
  );

  const selectedShapes = selectedIds
    .map((id) => getShape(ydoc, id))
    .filter((shape): shape is Shape => Boolean(shape));

  const multiSelected = selectedShapes.length > 1;

  useEffect(() => {
    const allVisibleShapes = filterEffectivelyVisibleShapes(getAllShapes(ydoc));

    if (selectedIds.length === 1) {
      const selectedShapeId = selectedIds[0]!;
      const shape = getShape(ydoc, selectedShapeId);
      setSelectedShape(shape);

      if (shape) {
        const componentId = getInstanceComponentId(ydoc, selectedShapeId);
        if (componentId) {
          const component = getComponentById(ydoc, componentId);
          setInstanceLabel(component?.name ?? 'Component');
        } else {
          setInstanceLabel(null);
        }

        const scopeIds = new Set(getExpandedShapeIds(ydoc, [selectedShapeId]));
        const scopedShapes = allVisibleShapes.filter((candidate) => scopeIds.has(candidate.id));
        setShapeScope(scopedShapes);
      } else {
        setInstanceLabel(null);
        setShapeScope([]);
      }
    } else {
      setSelectedShape(null);
      setInstanceLabel(null);
      setShapeScope(allVisibleShapes);
    }

    setCanvasShape(createCanvasScopeShape(allVisibleShapes));
  }, [selectedIds, ydoc, revision, activePageId]);

  useEffect(() => {
    const unobserve = observeShapes(ydoc, () => {
      setRevision((r) => r + 1);
    });
    return unobserve;
  }, [ydoc, activePageId]);

  useEffect(() => {
    return observeComponents(ydoc, () => {
      setRevision((r) => r + 1);
    });
  }, [ydoc]);

  const handleUpdate = useCallback(
    (props: Partial<Shape>) => {
      if (selectedIds.length !== 1) return;
      opUpdateShape(ydoc, selectedIds[0]!, props);
    },
    [ydoc, selectedIds],
  );

  const handleBatchUpdate = useCallback(
    (props: Partial<Shape>) => {
      opBatchUpdateShapes(
        ydoc,
        selectedShapes.map((s) => ({ shapeId: s.id, props })),
      );
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  const handleAlign = useCallback(
    (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
      if (selectedShapes.length < 2) return;
      opAlignShapes(
        ydoc,
        selectedShapes.map((s) => s.id),
        alignment,
      );
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  const handleDistribute = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (selectedShapes.length < 3) return;
      opDistributeShapes(
        ydoc,
        selectedShapes.map((s) => s.id),
        direction,
      );
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  if (!rightPanelOpen) return null;

  if (versionHistoryOpen) {
    return (
      <div className="flex h-full w-60 shrink-0 flex-col border-l">
        <VersionHistoryPanel draftId={draftId} />
      </div>
    );
  }

  if (devMode) {
    return <DevModePanel ydoc={ydoc} />;
  }

  const sections = selectedShape ? getSectionsForShape(selectedShape.type) : [];

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-l">
      <ZoomControls ydoc={ydoc} />
      <div className="flex-1 overflow-auto">
        {!selectedShape && !multiSelected && (
          <RightPanelCanvas
            ydoc={ydoc}
            pageBgColor={pageBgColor}
            canvasShape={canvasShape}
            shapeScope={shapeScope}
            onPageBgColorChange={handlePageBgColorChange}
          />
        )}
        {!selectedShape && multiSelected && (
          <RightPanelMultiSelect
            ydoc={ydoc}
            selectedShapes={selectedShapes}
            shapeScope={shapeScope}
            onAlign={handleAlign}
            onDistribute={handleDistribute}
            onBatchUpdate={handleBatchUpdate}
          />
        )}
        {selectedShape && (
          <div>
            {instanceLabel && (
              <div className="border-b px-3 py-2">
                <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
                  Instance
                </p>
                <p className="text-xs font-medium">of {instanceLabel}</p>
              </div>
            )}
            {sections.map((Section, index) => (
              <div key={Section.name || index} className="border-b px-3 py-3">
                <Section
                  ydoc={ydoc}
                  shape={selectedShape}
                  shapeScope={shapeScope}
                  onUpdate={handleUpdate}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DevModePanel({ ydoc }: { ydoc: Y.Doc }) {
  const inspectTab = useEditorStore((s) => s.inspectTab);
  const panelWidth = inspectTab === 'preview' ? 'w-[560px]' : 'w-72';

  return (
    <div className={`flex h-full ${panelWidth} shrink-0 flex-col border-l transition-[width]`}>
      <ZoomControls ydoc={ydoc} />
      <div className="min-h-0 flex-1">
        <InspectPanel ydoc={ydoc} />
      </div>
    </div>
  );
}
