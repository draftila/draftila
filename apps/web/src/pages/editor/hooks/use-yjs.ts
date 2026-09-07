import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import {
  collaborationAccessSchema,
  COLLABORATION_ACCESS_MESSAGE,
  COLLABORATION_ACCESS_CHANGED,
} from '@draftila/shared';
import { useEditorStore } from '@/stores/editor-store';
import { queryClient } from '@/lib/query-client';
import { api } from '@/lib/api-client';
import type { Draft } from '@draftila/shared';
import type { Shape } from '@draftila/shared';
import { WebsocketProvider } from 'y-websocket';
import {
  initDocument,
  getAllShapes,
  updateShape,
  applyAutoLayoutForShapes,
} from '@draftila/engine/scene-graph';
import { ensureDefaultPage, setDocId } from '@draftila/engine';
import { applyTextAutoResize } from '@draftila/engine/text-measure';
import {
  ensureFontsLoadedAsync,
  collectFontFamilies,
  onFontsLoaded,
  requiresCustomFontRegistry,
} from '@draftila/engine/font-manager';
import { isCustomFontsReady } from '@draftila/engine/custom-fonts';

const SYNC_DEBOUNCE_MS = 100;

interface UseYjsOptions {
  draftId: string;
  enabled?: boolean;
}

interface UseYjsReturn {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  awareness: WebsocketProvider['awareness'] | null;
  connected: boolean;
  synced: boolean;
  applyingRemoteChanges: boolean;
  reinitialize: () => void;
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/collaboration`;
}

function installDebouncedSync(provider: WebsocketProvider, canEdit: () => boolean) {
  const doc = provider.doc;

  doc.off(
    'update',
    (provider as unknown as { _updateHandler: (...args: unknown[]) => void })._updateHandler,
  );

  let pendingUpdates: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!canEdit()) pendingUpdates = [];
    if (pendingUpdates.length === 0) return;
    const merged = Y.mergeUpdatesV2(pendingUpdates.map((u) => Y.convertUpdateFormatV1ToV2(u)));
    const update = Y.convertUpdateFormatV2ToV1(merged);
    pendingUpdates = [];
    (
      provider as unknown as { _updateHandler: (update: Uint8Array, origin: unknown) => void }
    )._updateHandler(update, doc);
  };

  const debouncedHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === provider || !canEdit()) return;
    pendingUpdates.push(update);
    if (timer === null) {
      timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
    }
  };

  doc.on('update', debouncedHandler);

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
      flush();
    }
    doc.off('update', debouncedHandler);
  };
}

export function useYjs({ draftId, enabled = true }: UseYjsOptions): UseYjsReturn {
  const ydocRef = useRef<Y.Doc>(new Y.Doc());
  const providerRef = useRef<WebsocketProvider | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [applyingRemoteChanges, setApplyingRemoteChanges] = useState(false);
  const [reinitKey, setReinitKey] = useState(0);

  const reinitialize = useCallback(() => {
    setReinitKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let canEdit = false;
    let disposed = false;
    useEditorStore.getState().setCanEditDocument(false);
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    initDocument(ydoc);

    const wsUrl = getWebSocketUrl();
    const wsProvider = new WebsocketProvider(wsUrl, draftId, ydoc, {
      connect: true,
      maxBackoffTime: 5000,
      disableBc: true,
    });
    providerRef.current = wsProvider;
    wsProvider.messageHandlers[COLLABORATION_ACCESS_MESSAGE] = (_encoder, decoder) => {
      const access = collaborationAccessSchema.parse(JSON.parse(decoding.readVarString(decoder)));
      canEdit = access.canEdit;
      useEditorStore.getState().setCanEditDocument(canEdit);
    };
    wsProvider.on('connection-close', (event: CloseEvent | null) => {
      canEdit = false;
      useEditorStore.getState().setCanEditDocument(false);
      if (event?.code === COLLABORATION_ACCESS_CHANGED) {
        wsProvider.shouldConnect = false;
        void queryClient
          .fetchQuery({
            queryKey: ['drafts', 'detail', draftId],
            queryFn: () => api.get<Draft>(`/api/drafts/${draftId}`),
            staleTime: 0,
            retry: false,
          })
          .then(() => {
            if (!disposed) reinitialize();
          })
          .catch(() => {});
      }
    });

    let remoteChangeTimer: ReturnType<typeof setTimeout> | null = null;
    let textReconcileTimer: ReturnType<typeof setTimeout> | null = null;

    const reconcileTextShapes = () => {
      if (!canEdit) return;
      const shapes = getAllShapes(ydoc);
      const fonts = collectFontFamilies(shapes);
      // Ready gate: measuring before the registry settles would persist fallback auto-resize
      // geometry to collaborators. A re-run is guaranteed — both settle paths (success and terminal
      // error) fire exactly one `notifyFontCallbacks`, and this function is subscribed below.
      if (requiresCustomFontRegistry(fonts) && !isCustomFontsReady()) return;
      const apply = () => {
        if (!canEdit) return;
        const current = getAllShapes(ydoc);
        const pending: { id: string; patch: Partial<Shape> }[] = [];

        for (const shape of current) {
          if (shape.type !== 'text') continue;
          const patch = applyTextAutoResize(shape);
          if (patch) pending.push({ id: shape.id, patch });
        }

        if (pending.length === 0) return;

        ydoc.transact(() => {
          for (const entry of pending) {
            updateShape(ydoc, entry.id, entry.patch);
          }
          applyAutoLayoutForShapes(
            ydoc,
            pending.map((entry) => entry.id),
          );
        });
      };
      if (fonts.length > 0) {
        ensureFontsLoadedAsync(fonts).then(apply);
      } else {
        apply();
      }
    };

    const unsubscribeFonts = onFontsLoaded(reconcileTextShapes);

    const handleRemoteUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== wsProvider) return;
      setApplyingRemoteChanges(true);
      if (remoteChangeTimer) {
        clearTimeout(remoteChangeTimer);
      }
      remoteChangeTimer = setTimeout(() => {
        setApplyingRemoteChanges(false);
        remoteChangeTimer = null;
      }, 1200);

      if (textReconcileTimer) clearTimeout(textReconcileTimer);
      textReconcileTimer = setTimeout(reconcileTextShapes, 200);
    };

    ydoc.on('update', handleRemoteUpdate);

    const cleanupDebounce = installDebouncedSync(wsProvider, () => canEdit);

    wsProvider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      setSynced(isSynced);
      if (isSynced) {
        setDocId(ydoc, draftId);
        if (canEdit) ensureDefaultPage(ydoc);
        const fonts = collectFontFamilies(getAllShapes(ydoc));
        if (fonts.length > 0) {
          ensureFontsLoadedAsync(fonts).then(reconcileTextShapes);
        } else {
          reconcileTextShapes();
        }
      }
    });

    cleanupRef.current = () => {
      disposed = true;
      cleanupDebounce();
      canEdit = false;
      unsubscribeFonts();
      wsProvider.disconnect();
      wsProvider.destroy();
      ydoc.off('update', handleRemoteUpdate);
      if (remoteChangeTimer) clearTimeout(remoteChangeTimer);
      if (textReconcileTimer) clearTimeout(textReconcileTimer);
      ydoc.destroy();
      providerRef.current = null;
      setConnected(false);
      setSynced(false);
      setApplyingRemoteChanges(false);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [draftId, enabled, reinitKey, reinitialize]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    awareness: providerRef.current?.awareness ?? null,
    connected,
    synced,
    applyingRemoteChanges,
    reinitialize,
  };
}
