import type * as Y from 'yjs';
import {
  copyShapes,
  pasteShapes,
  cutShapes,
  duplicateShapes,
  copyStyle,
  pasteStyle,
  hasStyleClipboardContent,
} from '@draftila/engine/clipboard';
import { handlePaste as handleExternalPaste } from '@draftila/engine/figma-clipboard';
import { getSelectedContainer } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';
import {
  getExtensionFromMimeType,
  getImageFilesFromClipboardItems,
  pasteImageFiles,
} from './clipboard-utils';

function tryHandleExternalPaste(
  ydoc: Y.Doc,
  html: string | null,
  text: string | null,
  targetParentId: string | null,
  cursorCanvasPoint: { x: number; y: number } | null,
): string[] {
  try {
    return handleExternalPaste(ydoc, html, text, {
      targetParentId,
      cursorPosition: cursorCanvasPoint,
    });
  } catch {
    return [];
  }
}

export function handleClipboardKeyDown(e: KeyboardEvent, ydoc: Y.Doc): boolean {
  const isMod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const code = e.code;

  if (isMod && e.altKey && code === 'KeyC') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    const sourceId = selectedIds[0];
    if (sourceId) {
      copyStyle(ydoc, sourceId);
    }
    return true;
  }

  if (isMod && e.altKey && code === 'KeyV') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0 && hasStyleClipboardContent()) {
      pasteStyle(ydoc, selectedIds);
    }
    return true;
  }

  if (isMod && key === 'c') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0) copyShapes(ydoc, selectedIds);
    return true;
  }

  if (isMod && e.shiftKey && key === 'v' && !e.altKey) {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    const fallbackIds = pasteShapes(ydoc, { selectedIds, inPlace: true });
    if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
    return true;
  }

  if (isMod && key === 'v') {
    e.preventDefault();
    const { selectedIds, cursorCanvasPoint } = useEditorStore.getState();
    const targetParentId = getSelectedContainer(ydoc, selectedIds);
    navigator.clipboard
      .read()
      .then(async (items) => {
        let html: string | null = null;
        let text: string | null = null;
        const imageFiles: File[] = [];

        for (const item of items) {
          if (item.types.includes('text/html')) {
            html = await (await item.getType('text/html')).text();
          }
          if (item.types.includes('text/plain')) {
            text = await (await item.getType('text/plain')).text();
          }
          for (const type of item.types) {
            if (!type.startsWith('image/')) continue;
            const blob = await item.getType(type);
            imageFiles.push(
              new File([blob], `pasted-image.${getExtensionFromMimeType(type)}`, {
                type,
              }),
            );
          }
        }

        if (imageFiles.length > 0) {
          const imageIds = await pasteImageFiles(
            ydoc,
            imageFiles,
            targetParentId,
            cursorCanvasPoint,
          );
          if (imageIds.length > 0) {
            useEditorStore.getState().setSelectedIds(imageIds);
            return;
          }
        }

        if (html || text) {
          const newIds = tryHandleExternalPaste(
            ydoc,
            html,
            text,
            targetParentId,
            cursorCanvasPoint,
          );
          if (newIds.length > 0) {
            useEditorStore.getState().setSelectedIds(newIds);
            return;
          }
        }

        const fallbackIds = pasteShapes(ydoc, {
          selectedIds,
          cursorPosition: cursorCanvasPoint,
        });
        if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
      })
      .catch((err) => {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              const newIds = tryHandleExternalPaste(
                ydoc,
                null,
                text,
                targetParentId,
                cursorCanvasPoint,
              );
              if (newIds.length > 0) {
                useEditorStore.getState().setSelectedIds(newIds);
                return;
              }
            }

            const fallbackIds = pasteShapes(ydoc, {
              selectedIds,
              cursorPosition: cursorCanvasPoint,
            });
            if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
          })
          .catch(() => {
            const fallbackIds = pasteShapes(ydoc, {
              selectedIds,
              cursorPosition: cursorCanvasPoint,
            });
            if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
          });
      });
    return true;
  }

  if (isMod && key === 'x') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0) {
      cutShapes(ydoc, selectedIds);
      useEditorStore.getState().clearSelection();
    }
    return true;
  }

  if (isMod && key === 'd') {
    e.preventDefault();
    const { selectedIds } = useEditorStore.getState();
    if (selectedIds.length > 0) {
      const newIds = duplicateShapes(ydoc, selectedIds);
      useEditorStore.getState().setSelectedIds(newIds);
    }
    return true;
  }

  return false;
}

export function handlePasteEvent(e: ClipboardEvent, ydoc: Y.Doc): void {
  e.preventDefault();

  const { selectedIds, cursorCanvasPoint } = useEditorStore.getState();
  const targetParentId = getSelectedContainer(ydoc, selectedIds);

  const imageFiles = Array.from(e.clipboardData?.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
  const itemImageFiles = getImageFilesFromClipboardItems(e.clipboardData?.items);
  const allImageFiles = imageFiles.length > 0 ? imageFiles : itemImageFiles;
  if (allImageFiles.length > 0) {
    pasteImageFiles(ydoc, allImageFiles, targetParentId, cursorCanvasPoint)
      .then((imageIds) => {
        if (imageIds.length > 0) {
          useEditorStore.getState().setSelectedIds(imageIds);
        }
      })
      .catch(() => undefined);
    return;
  }

  const html = e.clipboardData?.getData('text/html') || null;
  const text = e.clipboardData?.getData('text/plain') || null;

  if (html || text) {
    const newIds = tryHandleExternalPaste(ydoc, html, text, targetParentId, cursorCanvasPoint);
    if (newIds.length > 0) {
      useEditorStore.getState().setSelectedIds(newIds);
      return;
    }
  }

  const fallbackIds = pasteShapes(ydoc, {
    selectedIds,
    cursorPosition: cursorCanvasPoint,
  });
  if (fallbackIds.length > 0) useEditorStore.getState().setSelectedIds(fallbackIds);
}
