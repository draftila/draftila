import { useEffect } from 'react';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { handleMcpTool } from '../mcp-tools';

const MESSAGE_RPC = 2;

export function useMcpRpc(ydoc: Y.Doc, provider: WebsocketProvider | null) {
  useEffect(() => {
    if (!provider) return;

    const ws = provider.ws;
    if (!ws) return;

    const onMessage = async (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer)) return;

      const data = new Uint8Array(event.data);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);
      if (messageType !== MESSAGE_RPC) return;

      const payload = decoding.readVarString(decoder);
      let request: { id: string; tool: string; args: Record<string, unknown> };
      try {
        request = JSON.parse(payload) as typeof request;
      } catch {
        return;
      }

      if (!request.id || !request.tool) return;

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

    const attachListener = () => {
      if (provider.ws) {
        provider.ws.addEventListener('message', onMessage);
      }
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
      if (provider.ws) {
        provider.ws.removeEventListener('message', onMessage);
      }
    };
  }, [ydoc, provider]);
}
