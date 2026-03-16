import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { initDocument } from '@draftila/engine/scene-graph';

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
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/collaboration`;
}

export function useYjs({ draftId, enabled = true }: UseYjsOptions): UseYjsReturn {
  const ydocRef = useRef<Y.Doc>(new Y.Doc());
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);

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

    wsProvider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      setSynced(isSynced);
    });

    return () => {
      wsProvider.disconnect();
      wsProvider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      setConnected(false);
      setSynced(false);
    };
  }, [draftId, enabled]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    awareness: providerRef.current?.awareness ?? null,
    connected,
    synced,
  };
}
