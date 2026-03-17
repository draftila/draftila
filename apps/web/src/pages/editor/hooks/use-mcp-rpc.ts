import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { mcpRpcRequestSchema } from '@draftila/shared';
import { handleMcpTool } from '../mcp-tools';

const MESSAGE_RPC = 2;

export function useMcpRpc(ydoc: Y.Doc, provider: WebsocketProvider | null) {
  useEffect(() => {
    if (!provider) return;

    let attachedSocket: WebSocket | null = null;

    const onMessage = async (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer)) return;

      const data = new Uint8Array(event.data);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);
      if (messageType !== MESSAGE_RPC) return;

      const payload = decoding.readVarString(decoder);
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        return;
      }

      const parsedRequest = mcpRpcRequestSchema.safeParse(parsedPayload);
      if (!parsedRequest.success) {
        return;
      }

      const request = parsedRequest.data;

      let response: { id: string; result?: unknown; error?: string };
      try {
        const result = await handleMcpTool(ydoc, request.tool, request.args);
        response = { id: request.id, result };
      } catch (err) {
        response = {
          id: request.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }

      const responsePayload = JSON.stringify(response);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_RPC);
      encoding.writeVarString(encoder, responsePayload);
      const message = encoding.toUint8Array(encoder);

      if (provider.wsconnected && provider.ws) {
        provider.ws.send(message);
      }
    };

    const detachListener = () => {
      if (!attachedSocket) {
        return;
      }
      attachedSocket.removeEventListener('message', onMessage);
      attachedSocket = null;
    };

    const attachListener = () => {
      const nextSocket = provider.ws;
      if (!nextSocket || nextSocket === attachedSocket) {
        return;
      }
      detachListener();
      nextSocket.addEventListener('message', onMessage);
      attachedSocket = nextSocket;
    };

    attachListener();

    const onStatus = ({ status }: { status: string }) => {
      if (status === 'connected') {
        attachListener();
      }
    };
    provider.on('status', onStatus);

    return () => {
      provider.off('status', onStatus);
      detachListener();
    };
  }, [ydoc, provider]);
}
