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
import { useEditorStore } from '@/stores/editor-store';
import { ExportSection } from './right-panel/sections/export-section';
import { PreviewSection } from './right-panel/sections/preview-section';
import { getSectionsForShape } from './right-panel/section-registry';
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

  const selectedShapes = selectedIds
    .map((id) => getShape(ydoc, id))
    .filter((shape): shape is Shape => Boolean(shape));

  const multiSelected = selectedShapes.length > 1;

  const sharedOpacity = (() => {
    if (!multiSelected) return null;
    const first = selectedShapes[0]?.opacity;
    if (first === undefined) return null;
    return selectedShapes.every((shape) => shape.opacity === first) ? first : null;
  })();

  const sharedFillColor = (() => {
    if (!multiSelected) return null;
    const firstShape = selectedShapes[0] as
      | (Shape & { fills?: Array<{ color?: string }> })
      | undefined;
    const firstColor = firstShape?.fills?.[0]?.color;
    if (!firstColor) return null;

    const allHaveSame = selectedShapes.every((shape) => {
      const withFills = shape as Shape & { fills?: Array<{ color?: string }> };
      return withFills.fills?.[0]?.color === firstColor;
    });

    return allHaveSame ? firstColor : null;
  })();

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

  const handleBatchOpacityUpdate = useCallback(
    (nextOpacity: number) => {
      const clamped = Math.max(0, Math.min(1, nextOpacity));
      for (const shape of selectedShapes) {
        updateShape(ydoc, shape.id, { opacity: clamped });
        applyAutoLayoutForAncestors(ydoc, shape.id);
      }
      setRevision((r) => r + 1);
    },
    [ydoc, selectedShapes],
  );

  const handleBatchFillColorUpdate = useCallback(
    (nextColor: string) => {
      for (const shape of selectedShapes) {
        const withFills = shape as Shape & {
          fills?: Array<Record<string, unknown>>;
        };
        const fills = withFills.fills;
        if (!fills || fills.length === 0) continue;
        const [first, ...rest] = fills;
        const nextFirst = {
          ...first,
          color: nextColor,
          gradient: undefined,
        };
        updateShape(ydoc, shape.id, {
          fills: [nextFirst, ...rest],
        } as Partial<Shape>);
        applyAutoLayoutForAncestors(ydoc, shape.id);
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
            </div>
            <div className="border-b px-3 py-3">
              <div className="space-y-2">
                <div>
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium">Opacity</p>
                  <div className="border-input flex h-7 items-center rounded border px-2">
                    <input
                      type="text"
                      value={
                        sharedOpacity === null
                          ? 'Mixed'
                          : Math.round(sharedOpacity * 100).toString()
                      }
                      onChange={(event) => {
                        const next = Number.parseFloat(event.target.value);
                        if (!Number.isFinite(next)) return;
                        handleBatchOpacityUpdate(next / 100);
                      }}
                      className="h-full w-full bg-transparent text-[11px] outline-none"
                    />
                    <span className="text-muted-foreground text-[11px]">%</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium">Fill</p>
                  <div className="border-input flex h-7 items-center gap-2 rounded border px-2">
                    <input
                      type="color"
                      value={sharedFillColor ?? '#d9d9d9'}
                      onChange={(event) => handleBatchFillColorUpdate(event.target.value)}
                      className="h-4 w-4 rounded border-0 p-0"
                    />
                    <span className="text-[11px]">
                      {sharedFillColor ? sharedFillColor : 'Mixed'}
                    </span>
                  </div>
                </div>
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
