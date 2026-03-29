import { useEffect } from 'react';
import type * as Y from 'yjs';
import { useEditorStore } from '@/stores/editor-store';
import {
  handleGuideKeyDown,
  handleToolKeyDown,
  handleCameraKeyDown,
  handleClipboardKeyDown,
  handleShapeKeyDown,
  handlePasteEvent,
  handleVersionKeyDown,
} from '../lib/keyboard';

interface UseKeyboardOptions {
  ydoc: Y.Doc;
}

export function useKeyboard({ ydoc }: UseKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;

      if (handleVersionKeyDown(e)) return;
      if (handleGuideKeyDown(e, ydoc)) return;
      if (handleToolKeyDown(e, ydoc)) return;
      if (handleCameraKeyDown(e, ydoc)) return;
      if (handleClipboardKeyDown(e, ydoc)) return;
      handleShapeKeyDown(e, ydoc);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useEditorStore.getState().editingTextId) return;
      handlePasteEvent(e, ydoc);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [ydoc]);
}
