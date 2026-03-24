import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { getAllShapes } from '@draftila/engine/scene-graph';
import { useEditorStore } from '@/stores/editor-store';

const MESSAGE_RPC = 2;
const SHIMMER_IDLE_MS = 10_000;

const READ_ONLY_TOOLS = new Set([
  'get_shape',
  'list_shapes',
  'list_pages',
  'list_components',
  'list_guides',
  'export_svg',
  'export_png',
]);

function getTopLevelFrameIds(ydoc: Y.Doc): Set<string> {
  const shapes = getAllShapes(ydoc);
  const shapeMap = new Map(shapes.map((s) => [s.id, s]));
  const topFrames = new Set<string>();

  for (const shape of shapes) {
    if (shape.type !== 'frame') continue;
    let isNested = false;
    let parentId = shape.parentId ?? null;
    while (parentId) {
      const parent = shapeMap.get(parentId);
      if (parent?.type === 'frame') {
        isNested = true;
        break;
      }
      parentId = parent?.parentId ?? null;
    }
    if (!isNested) topFrames.add(shape.id);
  }

  return topFrames;
}

interface UseRpcOptions {
  provider: WebsocketProvider | null;
  ydoc: Y.Doc;
  enabled: boolean;
}

export function useRpc({ provider, ydoc, enabled }: UseRpcOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !provider) return;

    const clearShimmer = () => {
      useEditorStore.getState().setAiActiveFrameIds(new Set());
    };

    const resetShimmerTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const topFrames = getTopLevelFrameIds(ydoc);
      if (topFrames.size > 0) {
        useEditorStore.getState().setAiActiveFrameIds(topFrames);
      }

      timerRef.current = setTimeout(() => {
        clearShimmer();
        timerRef.current = null;
      }, SHIMMER_IDLE_MS);
    };

    const handleRemoteUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) {
        resetShimmerTimer();
      }
    };
    ydoc.on('update', handleRemoteUpdate);

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
      const tool = parsed.tool;
      const args = parsed.args ?? {};
      const isMutating = !READ_ONLY_TOOLS.has(tool);

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
        const handler = getRpcHandler(tool);

        if (!handler) {
          sendResponse(null, `Unknown RPC tool: ${tool}`);
          return;
        }

        const result = handler(ydoc, args);
        if (result instanceof Promise) {
          result
            .then((r) => {
              if (isMutating) resetShimmerTimer();
              sendResponse(r);
            })
            .catch((err: Error) => {
              if (isMutating) resetShimmerTimer();
              sendResponse(null, err.message);
            });
        } else {
          if (isMutating) resetShimmerTimer();
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
      ydoc.off('update', handleRemoteUpdate);
      const currentWs = (provider as unknown as { ws: WebSocket | null }).ws;
      if (currentWs) {
        currentWs.removeEventListener('message', handleMessage);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      clearShimmer();
    };
  }, [provider, ydoc, enabled]);
}
