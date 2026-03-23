import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MESSAGE_RPC = 2;

interface UseRpcOptions {
  provider: WebsocketProvider | null;
  ydoc: Y.Doc;
  enabled: boolean;
}

export function useRpc({ provider, ydoc, enabled }: UseRpcOptions) {
  useEffect(() => {
    if (!enabled || !provider) return;

    const handleMessage = async (event: MessageEvent) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      if (messageType !== MESSAGE_RPC) return;

      const payload = decoding.readVarString(decoder);
      let parsed: { id?: string; tool?: string; args?: Record<string, unknown> };
      try {
        parsed = JSON.parse(payload) as typeof parsed;
      } catch {
        return;
      }

      if (!parsed.id || !parsed.tool) return;

      const rpcId = parsed.id;

      const sendResponse = (result: unknown, error?: string) => {
        const currentWs = (provider as unknown as { ws: WebSocket | null }).ws;
        if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

        const responsePayload = error
          ? JSON.stringify({ id: rpcId, error })
          : JSON.stringify({ id: rpcId, result });

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_RPC);
        encoding.writeVarString(encoder, responsePayload);
        currentWs.send(encoding.toUint8Array(encoder));
      };

      try {
        const { getRpcHandler } = await import('../rpc-handlers');
        const handler = getRpcHandler(parsed.tool);

        if (!handler) {
          sendResponse(null, `Unknown RPC tool: ${parsed.tool}`);
          return;
        }

        const result = handler(ydoc, parsed.args ?? {});
        if (result instanceof Promise) {
          result
            .then((r) => sendResponse(r))
            .catch((err: Error) => sendResponse(null, err.message));
        } else {
          sendResponse(result);
        }
      } catch (err) {
        sendResponse(null, err instanceof Error ? err.message : 'Unknown error');
      }
    };

    const setupListener = () => {
      const currentWs = (provider as unknown as { ws: WebSocket | null }).ws;
      if (currentWs) {
        currentWs.addEventListener('message', handleMessage);
      }
    };

    setupListener();

    const onStatus = ({ status }: { status: string }) => {
      if (status === 'connected') {
        setTimeout(setupListener, 0);
      }
    };
    provider.on('status', onStatus);

    return () => {
      provider.off('status', onStatus);
      const currentWs = (provider as unknown as { ws: WebSocket | null }).ws;
      if (currentWs) {
        currentWs.removeEventListener('message', handleMessage);
      }
    };
  }, [provider, ydoc, enabled]);
}
