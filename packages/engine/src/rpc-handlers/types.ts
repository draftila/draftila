import type * as Y from 'yjs';

export type RpcArgs = Record<string, unknown>;
export type RpcHandler = (ydoc: Y.Doc, args: RpcArgs) => unknown | Promise<unknown>;
