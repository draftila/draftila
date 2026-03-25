import * as encoding from 'lib0/encoding';
import { nanoid } from '../../common/lib/utils';

const MESSAGE_RPC = 2;
const RPC_TIMEOUT_MS = 30_000;

interface WsLike {
  send(data: Uint8Array | ArrayBuffer | string): void;
}

interface PendingRpc {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type RpcInterceptorFn = (
  draftId: string,
  tool: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

const pendingRpcs = new Map<string, PendingRpc>();

let rpcInterceptor: RpcInterceptorFn | null = null;

export function setRpcInterceptor(interceptor: RpcInterceptorFn | null) {
  rpcInterceptor = interceptor;
}

export function getRpcInterceptor(): RpcInterceptorFn | null {
  return rpcInterceptor;
}

export function sendRpc(
  draftId: string,
  tool: string,
  args: Record<string, unknown>,
  getConnections: (draftId: string) => Set<WsLike> | undefined,
): Promise<unknown> {
  if (rpcInterceptor) {
    return rpcInterceptor(draftId, tool, args);
  }

  const connections = getConnections(draftId);
  if (!connections || connections.size === 0) {
    return Promise.reject(new Error('No editor connected'));
  }

  const id = nanoid();
  const payload = JSON.stringify({ id, tool, args });

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_RPC);
  encoding.writeVarString(encoder, payload);
  const message = encoding.toUint8Array(encoder);

  const target = connections.values().next().value as WsLike;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRpcs.delete(id);
      reject(new Error('RPC timeout'));
    }, RPC_TIMEOUT_MS);

    pendingRpcs.set(id, { resolve, reject, timer });
    target.send(message);
  });
}

export function handleRpcResponse(payload: string) {
  let parsed: { id?: string; result?: unknown; error?: string };
  try {
    parsed = JSON.parse(payload) as typeof parsed;
  } catch {
    return;
  }

  if (!parsed.id) return;

  const pending = pendingRpcs.get(parsed.id);
  if (!pending) return;

  pendingRpcs.delete(parsed.id);
  clearTimeout(pending.timer);

  if (parsed.error) {
    pending.reject(new Error(parsed.error));
  } else {
    pending.resolve(parsed.result);
  }
}

export function rejectAllPending() {
  for (const [id, pending] of pendingRpcs) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Server shutting down'));
    pendingRpcs.delete(id);
  }
}
