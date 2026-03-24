import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  initDocument,
  getAllShapes,
  updateShape,
  applyAutoLayoutForAncestors,
} from '@draftila/engine/scene-graph';
import { ensureDefaultPage } from '@draftila/engine';
import { applyTextAutoResize } from '@draftila/engine/text-measure';
import { ensureFontsLoadedAsync, collectFontFamilies } from '@draftila/engine/font-manager';

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
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/collaboration`;
}

function installDebouncedSync(provider: WebsocketProvider) {
  const doc = provider.doc;

  doc.off(
    'update',
    (provider as unknown as { _updateHandler: (...args: unknown[]) => void })._updateHandler,
  );

  let pendingUpdates: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (pendingUpdates.length === 0) return;
    const merged = Y.mergeUpdatesV2(pendingUpdates.map((u) => Y.convertUpdateFormatV1ToV2(u)));
    const update = Y.convertUpdateFormatV2ToV1(merged);
    pendingUpdates = [];
    (
      provider as unknown as { _updateHandler: (update: Uint8Array, origin: unknown) => void }
    )._updateHandler(update, doc);
  };

  const debouncedHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === provider) return;
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
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [applyingRemoteChanges, setApplyingRemoteChanges] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    initDocument(ydoc);

    const wsUrl = getWebSocketUrl();
    const wsProvider = new WebsocketProvider(wsUrl, draftId, ydoc, {
      connect: true,
    });
    providerRef.current = wsProvider;

    let remoteChangeTimer: ReturnType<typeof setTimeout> | null = null;
    let textReconcileTimer: ReturnType<typeof setTimeout> | null = null;

    const reconcileTextShapes = () => {
      const shapes = getAllShapes(ydoc);
      const fonts = collectFontFamilies(shapes);
      const apply = () => {
        const changedIds: string[] = [];
        for (const shape of getAllShapes(ydoc)) {
          if (shape.type !== 'text') continue;
          const patch = applyTextAutoResize(shape);
          if (patch) {
            updateShape(ydoc, shape.id, patch);
            changedIds.push(shape.id);
          }
        }
        for (const id of changedIds) {
          applyAutoLayoutForAncestors(ydoc, id);
        }
      };
      if (fonts.length > 0) {
        ensureFontsLoadedAsync(fonts).then(apply);
      } else {
        apply();
      }
    };

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

    const cleanupDebounce = installDebouncedSync(wsProvider);

    wsProvider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      setSynced(isSynced);
      if (isSynced) {
        ensureDefaultPage(ydoc);
        const fonts = collectFontFamilies(getAllShapes(ydoc));
        if (fonts.length > 0) {
          ensureFontsLoadedAsync(fonts).then(reconcileTextShapes);
        } else {
          reconcileTextShapes();
        }
      }
    });

    return () => {
      cleanupDebounce();
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
  }, [draftId, enabled]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    awareness: providerRef.current?.awareness ?? null,
    connected,
    synced,
    applyingRemoteChanges,
  };
}
