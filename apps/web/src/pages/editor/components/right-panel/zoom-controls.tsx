import type * as Y from 'yjs';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getZoomPercentage } from '@draftila/engine/camera';
import { getAllShapes } from '@draftila/engine/scene-graph';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEditorStore } from '@/stores/editor-store';

function getBounds(shapes: Array<{ x: number; y: number; width: number; height: number }>) {
  if (shapes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  return { minX, minY, maxX, maxY };
}

function getCanvasViewportRect(): DOMRect | null {
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  return canvas.getBoundingClientRect();
}

function fitCameraToBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewport: DOMRect,
  padding: number,
) {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = Math.min(
    256,
    Math.max(0.02, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)),
  );

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: viewport.width / 2 - centerX * zoom,
    y: viewport.height / 2 - centerY * zoom,
    zoom,
  };
}

interface ZoomControlsProps {
  ydoc: Y.Doc;
}

export function ZoomControls({ ydoc }: ZoomControlsProps) {
  const zoom = useEditorStore((s) => s.camera.zoom);
  const camera = useEditorStore((s) => s.camera);
  const setCamera = useEditorStore((s) => s.setCamera);
  const selectedIds = useEditorStore((s) => s.selectedIds);

  const handleZoomToFitAll = () => {
    const shapes = getAllShapes(ydoc).filter((shape) => shape.visible);
    const bounds = getBounds(shapes);
    if (!bounds) return;
    const viewport = getCanvasViewportRect();
    if (!viewport) return;
    const next = fitCameraToBounds(bounds, viewport, 80);
    if (!next) return;
    setCamera(next);
  };

  const handleZoomToSelection = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const shapes = getAllShapes(ydoc).filter((shape) => selectedSet.has(shape.id) && shape.visible);
    const bounds = getBounds(shapes);
    if (!bounds) return;
    const viewport = getCanvasViewportRect();
    if (!viewport) return;
    const next = fitCameraToBounds(bounds, viewport, 120);
    if (!next) return;
    setCamera(next);
  };

  return (
    <div className="flex w-full items-center justify-between border-b px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setCamera({ ...camera, zoom: Math.max(0.02, camera.zoom / 1.25) })}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground min-w-[44px] px-1 text-center font-mono text-[11px] transition-colors">
            {getZoomPercentage(zoom)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-[140px]">
          <DropdownMenuItem onSelect={() => setCamera({ ...camera, zoom: 1 })}>
            Reset to 100%
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleZoomToFitAll}>Zoom to Fit All</DropdownMenuItem>
          <DropdownMenuItem onSelect={handleZoomToSelection} disabled={selectedIds.length === 0}>
            Zoom to Selection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setCamera({ ...camera, zoom: Math.min(256, camera.zoom * 1.25) })}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
