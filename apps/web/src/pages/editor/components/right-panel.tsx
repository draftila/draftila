import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import {
  getAllShapes,
  getExpandedShapeIds,
  getShape,
  observeShapes,
  updateShape,
  applyAutoLayout,
  applyAutoLayoutForAncestors,
} from '@draftila/engine/scene-graph';
import { getComponentById, getInstanceComponentId, observeComponents } from '@draftila/engine';
import { isAutoLayoutFrame } from '@draftila/engine/auto-layout';
import { alignShapes, distributeShapes } from '@draftila/engine/selection';
import {
  getPageBackgroundColor,
  setPageBackgroundColor,
  observePages,
  DEFAULT_PAGE_BACKGROUND,
} from '@draftila/engine';
import { useEditorStore } from '@/stores/editor-store';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ColorPicker } from './color-picker';
import { ExportSection } from './right-panel/sections/export-section';
import { PreviewSection } from './right-panel/sections/preview-section';
import { getSectionsForMultiSelection, getSectionsForShape } from './right-panel/section-registry';
import { ZoomControls } from './right-panel/zoom-controls';

interface RightPanelProps {
  ydoc: Y.Doc;
}

function filterEffectivelyVisibleShapes(shapes: Shape[]): Shape[] {
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]));

  const isEffectivelyVisible = (shape: Shape): boolean => {
    if (!shape.visible) return false;

    let currentParentId = shape.parentId ?? null;
    while (currentParentId) {
      const parent = shapeMap.get(currentParentId);
      if (!parent) return false;
      if (!parent.visible) return false;
      currentParentId = parent.parentId ?? null;
    }

    return true;
  };

  return shapes.filter(isEffectivelyVisible);
}

function createCanvasScopeShape(scopeShapes: Shape[]): Shape {
  if (scopeShapes.length === 0) {
    return {
      id: 'canvas-scope',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      parentId: null,
      opacity: 1,
      locked: true,
      visible: true,
      name: 'Canvas',
      blendMode: 'normal',
      fills: [{ color: '#FFFFFF', opacity: 1, visible: false }],
      strokes: [],
      cornerRadius: 0,
      cornerSmoothing: 0,
      shadows: [],
      blurs: [],
      layoutSizingHorizontal: 'fixed',
      layoutSizingVertical: 'fixed',
      constraintHorizontal: 'left',
      constraintVertical: 'top',
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of scopeShapes) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  return {
    id: 'canvas-scope',
    type: 'rectangle',
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    rotation: 0,
    parentId: null,
    opacity: 1,
    locked: true,
    visible: true,
    name: 'Canvas',
    blendMode: 'normal',
    fills: [{ color: '#FFFFFF', opacity: 1, visible: false }],
    strokes: [],
    cornerRadius: 0,
    cornerSmoothing: 0,
    shadows: [],
    blurs: [],
    layoutSizingHorizontal: 'fixed',
    layoutSizingVertical: 'fixed',
    constraintHorizontal: 'left',
    constraintVertical: 'top',
  };
}

export function RightPanel({ ydoc }: RightPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const activePageId = useEditorStore((s) => s.activePageId);
  const rightPanelOpen = useEditorStore((s) => s.rightPanelOpen);
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
      const shapeId = selectedIds[0]!;
      updateShape(ydoc, shapeId, props);

      requestAnimationFrame(() => {
        const updatedShape = getShape(ydoc, shapeId);
        if (!updatedShape) return;

        if (isAutoLayoutFrame(updatedShape)) {
          applyAutoLayout(ydoc, shapeId);
        }

        applyAutoLayoutForAncestors(ydoc, shapeId);
      });
    },
    [ydoc, selectedIds],
  );

  const handleBatchUpdate = useCallback(
    (props: Partial<Shape>) => {
      for (const shape of selectedShapes) {
        updateShape(ydoc, shape.id, props);
        requestAnimationFrame(() => {
          if (isAutoLayoutFrame(shape)) {
            applyAutoLayout(ydoc, shape.id);
          }
          applyAutoLayoutForAncestors(ydoc, shape.id);
        });
      }
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  const handleAlign = useCallback(
    (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
      if (selectedShapes.length < 2) return;
      const updates = alignShapes(selectedShapes, alignment);
      for (const [id, pos] of updates) {
        updateShape(ydoc, id, pos as Partial<Shape>);
      }
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  const handleDistribute = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (selectedShapes.length < 3) return;
      const updates = distributeShapes(selectedShapes, direction);
      for (const [id, pos] of updates) {
        updateShape(ydoc, id, pos as Partial<Shape>);
      }
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  if (!rightPanelOpen) return null;

  const sections = selectedShape ? getSectionsForShape(selectedShape.type) : [];

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-l">
      <ZoomControls ydoc={ydoc} />
      <div className="flex-1 overflow-auto">
        {!selectedShape && !multiSelected && (
          <div>
            <div className="border-b px-3 py-3">
              <p className="text-muted-foreground mb-2 text-[11px] font-medium">Page</p>
              <div className="flex items-center gap-1.5">
                <ColorPicker
                  color={pageBgColor}
                  opacity={1}
                  onChange={handlePageBgColorChange}
                  onOpacityChange={() => {}}
                >
                  <button className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2.5 rounded py-0.5">
                    <div className="border-border relative h-5 w-5 shrink-0 overflow-hidden rounded border">
                      <div className="absolute inset-0" style={{ backgroundColor: pageBgColor }} />
                    </div>
                    <span className="truncate font-mono text-[11px] leading-snug">
                      {pageBgColor.replace('#', '').toUpperCase()}
                    </span>
                  </button>
                </ColorPicker>
              </div>
            </div>
            <div className="border-b px-3 py-3">
              <ExportSection
                ydoc={ydoc}
                shape={canvasShape}
                shapeScope={shapeScope}
                onUpdate={() => {}}
              />
            </div>
            <div className="border-b px-3 py-3">
              <PreviewSection
                ydoc={ydoc}
                shape={canvasShape}
                shapeScope={shapeScope}
                onUpdate={() => {}}
              />
            </div>
            {shapeScope.length === 0 && (
              <div className="text-muted-foreground px-3 py-3 text-xs">Canvas is empty</div>
            )}
          </div>
        )}
        {!selectedShape && multiSelected && (
          <div>
            <div className="border-b px-3 py-3">
              <p className="text-muted-foreground text-[11px] uppercase tracking-wide">Selection</p>
              <p className="text-xs font-medium">{selectedShapes.length} objects selected</p>
              {(() => {
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;
                for (const s of selectedShapes) {
                  minX = Math.min(minX, s.x);
                  minY = Math.min(minY, s.y);
                  maxX = Math.max(maxX, s.x + s.width);
                  maxY = Math.max(maxY, s.y + s.height);
                }
                const bw = Math.round(maxX - minX);
                const bh = Math.round(maxY - minY);
                return (
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {bw} x {bh}
                  </p>
                );
              })()}
            </div>
            <div className="border-b px-3 py-3">
              <p className="text-muted-foreground mb-2 text-[11px] font-medium">Align</p>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAlign('left')}
                    >
                      <AlignStartVertical className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align Left</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAlign('center-h')}
                    >
                      <AlignCenterVertical className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align Center</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAlign('right')}
                    >
                      <AlignEndVertical className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align Right</TooltipContent>
                </Tooltip>
                <div className="bg-border mx-1 h-4 w-px" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAlign('top')}
                    >
                      <AlignStartHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align Top</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAlign('center-v')}
                    >
                      <AlignCenterHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align Middle</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAlign('bottom')}
                    >
                      <AlignEndHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align Bottom</TooltipContent>
                </Tooltip>
              </div>
              {selectedShapes.length >= 3 && (
                <>
                  <p className="text-muted-foreground mb-2 mt-3 text-[11px] font-medium">
                    Distribute
                  </p>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDistribute('horizontal')}
                        >
                          <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Distribute Horizontally</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDistribute('vertical')}
                        >
                          <AlignVerticalSpaceAround className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Distribute Vertically</TooltipContent>
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
            {getSectionsForMultiSelection(selectedShapes.map((s) => s.type)).map(
              (Section, index) => (
                <div key={Section.name || index} className="border-b px-3 py-3">
                  <Section
                    ydoc={ydoc}
                    shape={selectedShapes[0]!}
                    shapeScope={shapeScope}
                    onUpdate={handleBatchUpdate}
                  />
                </div>
              ),
            )}
          </div>
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
