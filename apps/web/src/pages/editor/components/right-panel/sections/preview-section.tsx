import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Canvas2DRenderer } from '@draftila/engine/renderer/canvas2d';
import { renderShape } from '@draftila/engine/shape-renderer';
import type { PropertySectionProps } from '../types';

const PREVIEW_WIDTH = 216;
const PREVIEW_PADDING = 8;
const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

export function PreviewSection({ shapeScope }: PropertySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Canvas2DRenderer | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!rendererRef.current) {
      rendererRef.current = new Canvas2DRenderer(canvas);
    }
    const renderer = rendererRef.current;

    const previewShapes = shapeScope;

    if (previewShapes.length === 0) {
      const emptyHeight = 120;
      renderer.resize(PREVIEW_WIDTH, emptyHeight, window.devicePixelRatio);
      renderer.clear();
      canvas.style.height = `${emptyHeight}px`;
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const currentShape of previewShapes) {
      minX = Math.min(minX, currentShape.x);
      minY = Math.min(minY, currentShape.y);
      maxX = Math.max(maxX, currentShape.x + currentShape.width);
      maxY = Math.max(maxY, currentShape.y + currentShape.height);
    }

    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const availableWidth = PREVIEW_WIDTH - PREVIEW_PADDING * 2;
    const scale = Math.min(1, availableWidth / contentWidth);
    const previewHeight = contentHeight * scale + PREVIEW_PADDING * 2;

    renderer.resize(PREVIEW_WIDTH, previewHeight, window.devicePixelRatio);
    renderer.clear();
    renderer.save();
    renderer.applyCamera({
      x: -minX * scale + (PREVIEW_WIDTH - contentWidth * scale) / 2,
      y: -minY * scale + PREVIEW_PADDING,
      zoom: scale,
    });

    for (const currentShape of previewShapes) {
      renderShape(renderer, currentShape);
    }
    renderer.restore();

    canvas.style.height = `${previewHeight}px`;
  }, [expanded, shapeScope]);

  return (
    <section>
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-1">
        <ChevronRight
          className={`text-muted-foreground h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <h4 className="text-muted-foreground text-[11px] font-medium">Preview</h4>
      </button>
      {expanded && (
        <div className="mt-2 overflow-hidden rounded border">
          <div style={{ background: CHECKERBOARD }}>
            <canvas ref={canvasRef} className="w-full" style={{ width: PREVIEW_WIDTH }} />
          </div>
        </div>
      )}
    </section>
  );
}
