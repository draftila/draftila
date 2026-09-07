import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { getResolvedShapes } from '@draftila/engine';
import { exportToPng } from '@draftila/engine/export';
import { saveThumbnail } from '@/api/drafts';
import { useEditorStore } from '@/stores/editor-store';
import { saveSessionThumbnail } from '../lib/thumbnail-session';

const MAX_THUMBNAIL_SIZE = 400;

async function generateThumbnail(ydoc: Y.Doc): Promise<Blob | null> {
  const shapes = getResolvedShapes(ydoc);
  if (shapes.length === 0) return null;

  const blob = await exportToPng(shapes, 1);
  const bitmap = await createImageBitmap(blob);

  const scale = Math.min(MAX_THUMBNAIL_SIZE / bitmap.width, MAX_THUMBNAIL_SIZE / bitmap.height, 1);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.8);
  });
}

export function useThumbnail(draftId: string, ydoc: Y.Doc, synced: boolean) {
  const canEdit = useEditorStore((state) => state.canEditDocument);
  const sessionRef = useRef({ draftId, ydoc, synced, canEdit });
  sessionRef.current = { draftId, ydoc, synced, canEdit };

  useEffect(() => {
    return () => {
      void saveSessionThumbnail(sessionRef.current, generateThumbnail, saveThumbnail).catch(
        () => {},
      );
    };
  }, []);
}
