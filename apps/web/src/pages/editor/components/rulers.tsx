import { useCallback, useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import type { Camera, CanvasGuide, Point, Shape } from '@draftila/shared';
import { screenToCanvas } from '@draftila/engine/camera';
import { addGuide, getAllShapes } from '@draftila/engine';
import { useEditorStore } from '@/stores/editor-store';

const RULER_SIZE = 20;
const RULER_BG = '#2a2a2a';
const RULER_TEXT = '#888888';
const RULER_TICK = '#555555';
const CURSOR_COLOR = '#FF00FF';
const GUIDE_MARKER_COLOR = '#00BCD4';

const INTERVALS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function getTickInterval(zoom: number): number {
  for (const interval of INTERVALS) {
    if (interval * zoom >= 50) return interval;
  }
  return INTERVALS[INTERVALS.length - 1]!;
}

const SNAP_THRESHOLD = 5;

function snapGuideToShapes(
  position: number,
  axis: 'x' | 'y',
  shapes: Shape[],
  zoom: number,
): number {
  const threshold = SNAP_THRESHOLD / zoom;
  let best = position;
  let bestDist = threshold;

  for (const shape of shapes) {
    if (!shape.visible || shape.locked) continue;

    const edges =
      axis === 'x'
        ? [shape.x, shape.x + shape.width / 2, shape.x + shape.width]
        : [shape.y, shape.y + shape.height / 2, shape.y + shape.height];

    for (const edge of edges) {
      const d = Math.abs(position - edge);
      if (d < bestDist) {
        bestDist = d;
        best = edge;
      }
    }
  }

  return best;
}

function drawHorizontalRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  camera: Camera,
  cursorCanvasPoint: Point | null,
  guides: CanvasGuide[],
) {
  const interval = getTickInterval(camera.zoom);
  const majorEvery = 5;
  const offset = RULER_SIZE;
  const viewportStartX = -(camera.x - offset) / camera.zoom;
  const viewportEndX = (width - (camera.x - offset)) / camera.zoom;
  const firstTick = Math.floor(viewportStartX / interval) * interval;

  ctx.fillStyle = RULER_TEXT;
  ctx.strokeStyle = RULER_TICK;
  ctx.lineWidth = 1;
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let canvasX = firstTick; canvasX <= viewportEndX + interval; canvasX += interval) {
    const screenX = canvasX * camera.zoom + camera.x - offset;
    const tickIndex = Math.round(canvasX / interval);
    const isMajor = tickIndex % majorEvery === 0;

    ctx.beginPath();
    if (isMajor) {
      ctx.moveTo(screenX, RULER_SIZE * 0.3);
      ctx.lineTo(screenX, RULER_SIZE);
      ctx.stroke();
      ctx.fillText(Math.round(canvasX).toString(), screenX, 1);
    } else {
      ctx.moveTo(screenX, RULER_SIZE * 0.6);
      ctx.lineTo(screenX, RULER_SIZE);
      ctx.stroke();
    }
  }

  for (const guide of guides) {
    if (guide.axis !== 'x') continue;
    const sx = guide.position * camera.zoom + camera.x - offset;
    ctx.fillStyle = GUIDE_MARKER_COLOR;
    ctx.beginPath();
    ctx.moveTo(sx - 3, RULER_SIZE);
    ctx.lineTo(sx + 3, RULER_SIZE);
    ctx.lineTo(sx, RULER_SIZE - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = RULER_TEXT;
  }

  if (cursorCanvasPoint) {
    const sx = cursorCanvasPoint.x * camera.zoom + camera.x - offset;
    ctx.strokeStyle = CURSOR_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, RULER_SIZE);
    ctx.stroke();
  }

  ctx.strokeStyle = RULER_TICK;
  ctx.beginPath();
  ctx.moveTo(0, RULER_SIZE - 0.5);
  ctx.lineTo(width, RULER_SIZE - 0.5);
  ctx.stroke();
}

function drawVerticalRuler(
  ctx: CanvasRenderingContext2D,
  height: number,
  camera: Camera,
  cursorCanvasPoint: Point | null,
  guides: CanvasGuide[],
) {
  const interval = getTickInterval(camera.zoom);
  const majorEvery = 5;
  const offset = RULER_SIZE;
  const viewportStartY = -(camera.y - offset) / camera.zoom;
  const viewportEndY = (height - (camera.y - offset)) / camera.zoom;
  const firstTick = Math.floor(viewportStartY / interval) * interval;

  ctx.fillStyle = RULER_TEXT;
  ctx.strokeStyle = RULER_TICK;
  ctx.lineWidth = 1;
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let canvasY = firstTick; canvasY <= viewportEndY + interval; canvasY += interval) {
    const screenY = canvasY * camera.zoom + camera.y - offset;
    const tickIndex = Math.round(canvasY / interval);
    const isMajor = tickIndex % majorEvery === 0;

    ctx.beginPath();
    if (isMajor) {
      ctx.moveTo(RULER_SIZE * 0.3, screenY);
      ctx.lineTo(RULER_SIZE, screenY);
      ctx.stroke();

      ctx.save();
      ctx.translate(RULER_SIZE / 2 - 3, screenY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(Math.round(canvasY).toString(), 0, 0);
      ctx.restore();
    } else {
      ctx.moveTo(RULER_SIZE * 0.6, screenY);
      ctx.lineTo(RULER_SIZE, screenY);
      ctx.stroke();
    }
  }

  for (const guide of guides) {
    if (guide.axis !== 'y') continue;
    const sy = guide.position * camera.zoom + camera.y - offset;
    ctx.fillStyle = GUIDE_MARKER_COLOR;
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, sy - 3);
    ctx.lineTo(RULER_SIZE, sy + 3);
    ctx.lineTo(RULER_SIZE - 5, sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = RULER_TEXT;
  }

  if (cursorCanvasPoint) {
    const sy = cursorCanvasPoint.y * camera.zoom + camera.y - offset;
    ctx.strokeStyle = CURSOR_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(RULER_SIZE, sy);
    ctx.stroke();
  }

  ctx.strokeStyle = RULER_TICK;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE - 0.5, 0);
  ctx.lineTo(RULER_SIZE - 0.5, height);
  ctx.stroke();
}

interface RulerProps {
  orientation: 'horizontal' | 'vertical';
  ydoc: Y.Doc;
}

export function Ruler({ orientation, ydoc }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePageId = useEditorStore((s) => s.activePageId);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateSize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(parent);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      const { camera, cursorCanvasPoint, guides } = useEditorStore.getState();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = RULER_BG;
      ctx.fillRect(0, 0, width, height);

      if (orientation === 'horizontal') {
        drawHorizontalRuler(ctx, width, camera, cursorCanvasPoint, guides);
      } else {
        drawVerticalRuler(ctx, height, camera, cursorCanvasPoint, guides);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, [orientation]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!activePageId) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const axis: 'x' | 'y' = orientation === 'horizontal' ? 'x' : 'y';
      const screenPos = orientation === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top;
      const cam = useEditorStore.getState().camera;
      const canvasPos =
        orientation === 'horizontal'
          ? (screenPos - cam.x) / cam.zoom
          : (screenPos - cam.y) / cam.zoom;

      useEditorStore.getState().setDraggingGuide({ axis, position: Math.round(canvasPos) });

      const handleMove = (moveEvent: PointerEvent) => {
        const canvasEl = document.querySelector('canvas');
        if (!canvasEl) return;
        const canvasRect = canvasEl.getBoundingClientRect();
        const currentCam = useEditorStore.getState().camera;
        const point = screenToCanvas(
          moveEvent.clientX - canvasRect.left,
          moveEvent.clientY - canvasRect.top,
          currentCam,
        );
        const rawPos = axis === 'x' ? point.x : point.y;
        const shapes = getAllShapes(ydoc);
        const snappedPos = snapGuideToShapes(rawPos, axis, shapes, currentCam.zoom);
        useEditorStore.getState().setDraggingGuide({ axis, position: Math.round(snappedPos) });
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);

        const currentDragging = useEditorStore.getState().draggingGuide;
        useEditorStore.getState().setDraggingGuide(null);

        if (!currentDragging || !activePageId) return;

        const canvasEl = document.querySelector('canvas');
        if (!canvasEl) return;
        const canvasRect = canvasEl.getBoundingClientRect();
        const isOverCanvas =
          upEvent.clientX >= canvasRect.left &&
          upEvent.clientX <= canvasRect.right &&
          upEvent.clientY >= canvasRect.top &&
          upEvent.clientY <= canvasRect.bottom;

        if (isOverCanvas) {
          addGuide(ydoc, activePageId, currentDragging.axis, currentDragging.position);
        }
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [orientation, ydoc, activePageId],
  );

  const isHorizontal = orientation === 'horizontal';
  const style: React.CSSProperties = isHorizontal
    ? {
        position: 'absolute',
        top: 0,
        left: RULER_SIZE,
        right: 0,
        height: RULER_SIZE,
        zIndex: 10,
        cursor: 'row-resize',
      }
    : {
        position: 'absolute',
        top: RULER_SIZE,
        left: 0,
        bottom: 0,
        width: RULER_SIZE,
        zIndex: 10,
        cursor: 'col-resize',
      };

  return (
    <div style={style} onPointerDown={handlePointerDown}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

export function RulerCorner() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: RULER_SIZE,
        height: RULER_SIZE,
        backgroundColor: RULER_BG,
        zIndex: 11,
        borderRight: '1px solid #555555',
        borderBottom: '1px solid #555555',
      }}
    />
  );
}
