import type * as Y from 'yjs';
import type { Shape } from '@draftila/shared';
import { getAllShapes, exportToPng } from '@draftila/engine';
import {
  type RpcHandler,
  createRpcHandlers,
  collectShapesWithDescendants,
} from '@draftila/engine/rpc-handlers';

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

const exportPngHandler: RpcHandler = async (ydoc: Y.Doc, args) => {
  const allShapes = getAllShapes(ydoc);
  const ids = args['shapeIds'] as string[] | undefined;
  const shapes = ids && ids.length > 0 ? collectShapesWithDescendants(allShapes, ids) : allShapes;

  if (shapes.length === 0) return { error: 'No shapes to export' };

  const scale = (args['scale'] as number | undefined) ?? 1;
  const backgroundColor = args['backgroundColor'] as string | undefined;
  const blob = await exportToPng(shapes, scale, backgroundColor);
  const base64 = await blobToBase64(blob);
  return { base64, mimeType: 'image/png' };
};

const handlers = createRpcHandlers({ export_png: exportPngHandler });

export function getRpcHandler(tool: string): RpcHandler | undefined {
  return handlers[tool];
}
