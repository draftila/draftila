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
  getResolvedPageBackgroundColor,
  getPageBackgroundColorVar,
  setPageBackgroundColor,
  setPageBackgroundColorVar,
  observePages,
  observeVariables,
  buildVariableTable,
  resolveShapesColors,
  stripShapeColorVars,
  DEFAULT_PAGE_BACKGROUND,
} from '@draftila/engine';
import { useEditorStore } from '@/stores/editor-store';

import { filterEffectivelyVisibleShapes, createCanvasScopeShape } from './right-panel-utils';
import type { ColorChangeMeta } from './color-picker';
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
  const rightPanelView = useEditorStore((s) => s.rightPanelView);
  const setRightPanelView = useEditorStore((s) => s.setRightPanelView);
  const versionHistoryOpen = useEditorStore((s) => s.versionHistoryOpen);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [instanceLabel, setInstanceLabel] = useState<string | null>(null);
  const [shapeScope, setShapeScope] = useState<Shape[]>([]);
  const [canvasShape, setCanvasShape] = useState<Shape>(createCanvasScopeShape([]));
  const [revision, setRevision] = useState(0);
  const [pageBgColor, setPageBgColor] = useState(DEFAULT_PAGE_BACKGROUND);
  const [pageBgColorVar, setPageBgColorVar] = useState<string | undefined>(undefined);

  useEffect(() => {
    const refresh = () => {
      const currentPageId = useEditorStore.getState().activePageId ?? activePageId;
      setPageBgColor(
        currentPageId ? getResolvedPageBackgroundColor(ydoc, currentPageId) : DEFAULT_PAGE_BACKGROUND,
      );
      setPageBgColorVar(currentPageId ? getPageBackgroundColorVar(ydoc, currentPageId) : undefined);
    };

    refresh();
    const unobservePages = observePages(ydoc, refresh);
    // The background may be bound to a global, which observePages never sees.
    const unobserveVariables = observeVariables(ydoc, refresh);

    return () => {
      unobservePages();
      unobserveVariables();
    };
  }, [ydoc, activePageId]);

  const handlePageBgColorChange = useCallback(
    (color: string, meta?: ColorChangeMeta) => {
      if (!activePageId) return;
      // No meta means a plain edit, which detaches.
      setPageBackgroundColorVar(ydoc, activePageId, meta?.colorVar ?? null);
      setPageBackgroundColor(ydoc, activePageId, color);
    },
    [ydoc, activePageId],
  );

  const selectedShapes = selectedIds
    .map((id) => getShape(ydoc, id))
    .filter((shape): shape is Shape => Boolean(shape));

  const multiSelected = selectedShapes.length > 1;

  useEffect(() => {
    // Resolved: this feeds the Export/Preview sections, which render. The
    // selected shape below stays raw so the pickers can see their bindings.
    const allVisibleShapes = resolveShapesColors(
      buildVariableTable(ydoc),
      filterEffectivelyVisibleShapes(getAllShapes(ydoc)),
    );

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
    const bump = () => setRevision((r) => r + 1);
    const unobserve = observeShapes(ydoc, bump);
    // `shapeScope` feeds the Export and Preview sections, which render colour —
    // and a global lives outside the shapes map, so observeShapes never fires.
    const unobserveVariables = observeVariables(ydoc, bump);
    return () => {
      unobserve();
      unobserveVariables();
    };
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
      // The array being fanned out belongs to selectedShapes[0]. Copying its
      // colour bindings onto the others would create bindings the user never
      // made — and would do so for non-colour edits too, like toggling a fill's
      // visibility. The source shape keeps its own bindings.
      const strippedProps = stripShapeColorVars(props as Shape) as Partial<Shape>;
      opBatchUpdateShapes(
        ydoc,
        selectedShapes.map((s, index) => ({
          shapeId: s.id,
          props: index === 0 ? props : strippedProps,
        })),
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

  const sections = selectedShape ? getSectionsForShape(selectedShape.type) : [];

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l">
      <ZoomControls ydoc={ydoc} />
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <PanelViewTab
          active={rightPanelView === 'properties'}
          onClick={() => setRightPanelView('properties')}
        >
          Properties
        </PanelViewTab>
        <PanelViewTab
          active={rightPanelView === 'inspect'}
          onClick={() => setRightPanelView('inspect')}
        >
          Inspect
        </PanelViewTab>
      </div>
      {rightPanelView === 'inspect' ? (
        <div className="min-h-0 flex-1">
          <InspectPanel ydoc={ydoc} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {!selectedShape && !multiSelected && (
            <RightPanelCanvas
              ydoc={ydoc}
              pageBgColor={pageBgColor}
              pageBgColorVar={pageBgColorVar}
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
      )}
    </div>
  );
}

function PanelViewTab({
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
      type="button"
      className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
