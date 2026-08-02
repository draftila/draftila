import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { useEditorStore } from '@/stores/editor-store';
import { createCameraSession } from '../lib/camera-session';

interface UseCameraPersistenceOptions {
  draftId: string;
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
}

/**
 * Records genuine user camera movement and persists it per (draft, page).
 *
 * Deliberately not keyed on `synced`: that flips on every reconnect, and tearing
 * the session down each time would churn the pending map for no benefit. The
 * provider instance survives reconnects, so the triple below is the real
 * consistency signal.
 */
export function useCameraPersistence({
  draftId,
  ydoc,
  provider,
}: UseCameraPersistenceOptions): void {
  useEffect(() => {
    // EditorPage does not remount on a :draftId change and useYjs returns refs,
    // so for one render draftId is new while ydoc/provider are still the old
    // pair. Recording through that window would write into the wrong draft's key.
    if (!draftId || !provider) return;
    if (provider.roomname !== draftId || provider.doc !== ydoc) return;

    const session = createCameraSession({ draftId, ydoc });

    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.camera === prev.camera) return;
      if (state.previewSnapshotId) return; // preview pans are ephemeral
      session.record(state.camera);
    });

    const flush = () => session.flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
      // In-app navigation away is the most common save moment, and it fires no
      // pagehide — the dispose flush covers it.
      session.dispose();
    };
  }, [draftId, ydoc, provider]);
}
