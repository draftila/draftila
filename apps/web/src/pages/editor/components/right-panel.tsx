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
  };
}

export function RightPanel({ ydoc }: RightPanelProps) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const rightPanelOpen = useEditorStore((s) => s.rightPanelOpen);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [shapeScope, setShapeScope] = useState<Shape[]>([]);
  const [canvasShape, setCanvasShape] = useState<Shape>(createCanvasScopeShape([]));
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const allVisibleShapes = filterEffectivelyVisibleShapes(getAllShapes(ydoc));

    if (selectedIds.length === 1) {
      const selectedShapeId = selectedIds[0]!;
      const shape = getShape(ydoc, selectedShapeId);
      setSelectedShape(shape);

      if (shape) {
        const scopeIds = new Set(getExpandedShapeIds(ydoc, [selectedShapeId]));
        const scopedShapes = allVisibleShapes.filter((candidate) => scopeIds.has(candidate.id));
        setShapeScope(scopedShapes);
      } else {
        setShapeScope([]);
      }
    } else {
      setSelectedShape(null);
      setShapeScope(allVisibleShapes);
    }

    setCanvasShape(createCanvasScopeShape(allVisibleShapes));
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

  if (!rightPanelOpen) return null;

  const sections = selectedShape ? getSectionsForShape(selectedShape.type) : [];

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-l">
      <ZoomControls />
      <div className="flex-1 overflow-auto">
        {!selectedShape && (
          <div>
            <div className="border-b px-3 py-3">
              <ExportSection shape={canvasShape} shapeScope={shapeScope} onUpdate={() => {}} />
            </div>
            <div className="border-b px-3 py-3">
              <PreviewSection shape={canvasShape} shapeScope={shapeScope} onUpdate={() => {}} />
            </div>
            {shapeScope.length === 0 && (
              <div className="text-muted-foreground px-3 py-3 text-xs">Canvas is empty</div>
            )}
          </div>
        )}
        {selectedShape && (
          <div>
            {sections.map((Section, index) => (
              <div key={Section.name || index} className="border-b px-3 py-3">
                <Section shape={selectedShape} shapeScope={shapeScope} onUpdate={handleUpdate} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
