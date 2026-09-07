import type * as Y from 'yjs';

export interface ThumbnailSession {
  draftId: string;
  ydoc: Y.Doc;
  synced: boolean;
  canEdit: boolean;
}

export async function saveSessionThumbnail(
  session: ThumbnailSession,
  generate: (ydoc: Y.Doc) => Promise<Blob | null>,
  save: (draftId: string, blob: Blob) => Promise<unknown>,
) {
  if (!session.synced || !session.canEdit) return;
  const blob = await generate(session.ydoc);
  if (blob) await save(session.draftId, blob);
}
