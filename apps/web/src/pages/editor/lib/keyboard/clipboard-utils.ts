import type * as Y from 'yjs';
import { addImageFromFile } from '@draftila/engine/image-manager';

export function getExtensionFromMimeType(type: string): string {
  const subtype = type.split('/')[1];
  if (!subtype) return 'png';
  const cleanSubtype = subtype.split('+')[0];
  return cleanSubtype || 'png';
}

export async function pasteImageFiles(
  ydoc: Y.Doc,
  files: File[],
  targetParentId: string | null,
  cursorCanvasPoint: { x: number; y: number } | null,
): Promise<string[]> {
  if (files.length === 0) return [];

  const baseX = cursorCanvasPoint?.x ?? 100;
  const baseY = cursorCanvasPoint?.y ?? 100;

  const ids = await Promise.all(
    files.map((file, index) =>
      addImageFromFile(ydoc, file, baseX + index * 20, baseY + index * 20, targetParentId),
    ),
  );

  return ids;
}

export function getImageFilesFromClipboardItems(
  items: DataTransferItemList | null | undefined,
): File[] {
  if (!items) return [];

  const imageFiles: File[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) imageFiles.push(file);
  }

  return imageFiles;
}
