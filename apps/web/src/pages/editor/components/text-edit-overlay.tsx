import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { TextShape, Camera } from '@draftila/shared';
import { getShape, updateShape, deleteShape } from '@draftila/engine/scene-graph';
import { computeTextAutoResizeDimensions } from '@draftila/engine/text-measure';
import { useEditorStore } from '@/stores/editor-store';

interface TextEditOverlayProps {
  ydoc: Y.Doc;
  camera: Camera;
}

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

function countWrappedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): number {
  const paragraphs = text.split('\n');
  let count = 0;
  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      count++;
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        count++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) count++;
  }
  return Math.max(1, count);
}

function computeTextLayout(shape: TextShape, camera: Camera) {
  const screenHeight = shape.height * camera.zoom;

  const ctx = getMeasureCtx();
  if (!ctx) return { topOffset: 0, height: screenHeight, paddingTop: 0 };

  const fontStyle = shape.fontStyle === 'italic' ? 'italic' : '';
  ctx.font = `${fontStyle} ${shape.fontWeight} ${shape.fontSize}px ${shape.fontFamily}`.trim();

  let content = shape.content;
  if (shape.textTransform === 'uppercase') content = content.toUpperCase();
  else if (shape.textTransform === 'lowercase') content = content.toLowerCase();
  else if (shape.textTransform === 'capitalize')
    content = content.replace(/\b\w/g, (c) => c.toUpperCase());

  const lineCount = countWrappedLines(ctx, content, shape.width);
  const totalTextHeight = lineCount * shape.fontSize * shape.lineHeight;

  let offsetY = 0;
  if (shape.verticalAlign === 'middle') {
    offsetY = (shape.height - totalTextHeight) / 2;
  } else if (shape.verticalAlign === 'bottom') {
    offsetY = shape.height - totalTextHeight;
  }

  const coverTop = Math.min(0, offsetY);
  const coverBottom = Math.max(shape.height, offsetY + totalTextHeight);

  return {
    topOffset: coverTop * camera.zoom,
    height: (coverBottom - coverTop) * camera.zoom,
    paddingTop: (offsetY - coverTop) * camera.zoom,
  };
}

function computeStyle(shape: TextShape, camera: Camera): React.CSSProperties {
  const autoResize = (shape as TextShape & { textAutoResize?: string }).textAutoResize ?? 'none';
  const fontSize = shape.fontSize * camera.zoom;
  const screenX = shape.x * camera.zoom + camera.x;
  const screenY = shape.y * camera.zoom + camera.y;
  const screenWidth = shape.width * camera.zoom;
  const screenHeight = shape.height * camera.zoom;
  const letterSpacing = shape.letterSpacing * camera.zoom;
  const lineHeightPx = fontSize * shape.lineHeight;
  const layout = computeTextLayout(shape, camera);

  return {
    position: 'absolute',
    left: screenX,
    top: screenY + layout.topOffset,
    width: screenWidth,
    minHeight: layout.height,
    fontSize,
    fontFamily: shape.fontFamily,
    fontWeight: shape.fontWeight,
    fontStyle: shape.fontStyle,
    textAlign: shape.textAlign,
    lineHeight: `${lineHeightPx}px`,
    letterSpacing,
    color: 'transparent',
    textDecoration: 'none',
    textTransform: shape.textTransform === 'none' ? undefined : shape.textTransform,
    transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
    transformOrigin: shape.rotation
      ? `${screenWidth / 2}px ${-layout.topOffset + screenHeight / 2}px`
      : undefined,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    paddingTop: layout.paddingTop,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    margin: 0,
    whiteSpace: autoResize === 'width' ? 'pre' : 'pre-wrap',
    wordBreak: autoResize === 'width' ? undefined : 'break-word',
    caretColor: shape.fills.find((f) => f.visible)?.color ?? '#000000',
    zIndex: 50,
    boxSizing: 'border-box',
  };
}

function TextEditor({ ydoc, camera, shapeId }: { ydoc: Y.Doc; camera: Camera; shapeId: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shape = getShape(ydoc, shapeId);
  const [localContent, setLocalContent] = useState(() => {
    if (shape && shape.type === 'text') return shape.content;
    return '';
  });

  const commitAndClose = useCallback(() => {
    const current = getShape(ydoc, shapeId);
    if (current && current.type === 'text' && current.content.trim() === '') {
      deleteShape(ydoc, shapeId);
      useEditorStore.getState().clearSelection();
    }
    useEditorStore.getState().setEditingTextId(null);
  }, [ydoc, shapeId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        commitAndClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [commitAndClose]);

  if (!shape || shape.type !== 'text') return null;

  const textShape = shape as TextShape;
  const style = computeStyle(textShape, camera);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalContent(value);
    updateShape(ydoc, shapeId, { content: value } as Partial<TextShape>);

    const updated = getShape(ydoc, shapeId);
    if (updated && updated.type === 'text') {
      const textUpdated = updated as TextShape & {
        textAutoResize?: 'none' | 'width' | 'height';
      };
      const dims = computeTextAutoResizeDimensions(textUpdated);
      if (dims) {
        updateShape(ydoc, shapeId, {
          width: dims.width,
          height: dims.height,
        } as Partial<TextShape>);
      }
    }
  };

  const handleBlur = () => {
    commitAndClose();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <textarea
      ref={textareaRef}
      value={localContent}
      onChange={handleChange}
      onBlur={handleBlur}
      onPointerDown={handlePointerDown}
      style={style}
      spellCheck={false}
      autoComplete="off"
    />
  );
}

export function TextEditOverlay({ ydoc, camera }: TextEditOverlayProps) {
  const editingTextId = useEditorStore((s) => s.editingTextId);

  if (!editingTextId) return null;

  return <TextEditor key={editingTextId} ydoc={ydoc} camera={camera} shapeId={editingTextId} />;
}
