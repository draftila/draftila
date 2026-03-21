import type * as Y from 'yjs';
import { updateGuidePosition, removeGuide } from '@draftila/engine';
import { useEditorStore } from '@/stores/editor-store';

export function handleGuideKeyDown(e: KeyboardEvent, ydoc: Y.Doc): boolean {
  const { selectedGuideId, activePageId } = useEditorStore.getState();
  if (!selectedGuideId || !activePageId) return false;

  const key = e.key.toLowerCase();

  if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const guide = useEditorStore.getState().guides.find((g) => g.id === selectedGuideId);
    if (guide) {
      const delta =
        guide.axis === 'x'
          ? key === 'arrowleft'
            ? -step
            : key === 'arrowright'
              ? step
              : 0
          : key === 'arrowup'
            ? -step
            : key === 'arrowdown'
              ? step
              : 0;
      if (delta !== 0) {
        updateGuidePosition(ydoc, activePageId, selectedGuideId, guide.position + delta);
      }
    }
    return true;
  }

  if (key === 'delete' || key === 'backspace') {
    e.preventDefault();
    removeGuide(ydoc, activePageId, selectedGuideId);
    useEditorStore.getState().setSelectedGuideId(null);
    return true;
  }

  if (key === 'escape') {
    e.preventDefault();
    useEditorStore.getState().setSelectedGuideId(null);
    return true;
  }

  return false;
}
