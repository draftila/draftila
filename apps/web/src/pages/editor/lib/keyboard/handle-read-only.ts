import type * as Y from 'yjs';
import { handleCameraKeyDown } from './handle-camera';
import { handleClipboardKeyDown } from './handle-clipboard';
import { handleShapeKeyDown } from './handle-shapes';
import { handleToolKeyDown } from './handle-tools';

export function handleReadOnlyKeyDown(e: KeyboardEvent, ydoc: Y.Doc) {
  const key = e.key.toLowerCase();
  const isMod = e.metaKey || e.ctrlKey;
  if (handleCameraKeyDown(e, ydoc)) return;
  if (isMod && key === 'c') {
    handleClipboardKeyDown(e, ydoc);
  } else if (!isMod && !e.shiftKey && (key === 'v' || key === 'h' || key === 'c')) {
    handleToolKeyDown(e, ydoc);
  } else if (
    key === 'escape' ||
    key === 'tab' ||
    (isMod && key === 'a') ||
    (!isMod && e.shiftKey && (e.code === 'KeyR' || e.code === 'KeyC'))
  ) {
    handleShapeKeyDown(e, ydoc);
  } else if (isMod && (key === 'z' || key === 'x' || key === 'v')) {
    e.preventDefault();
  }
}
