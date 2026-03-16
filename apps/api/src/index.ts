import { app } from './app';
import { env } from './common/lib/env';
import { auth } from './modules/auth/auth.service';
import * as collaborationService from './modules/collaboration/collaboration.service';
import type { WsData } from './modules/collaboration/collaboration.service';
import * as draftsService from './modules/drafts/drafts.service';

const WS_PATH_PREFIX = '/api/collaboration/';

async function authenticateWsRequest(req: Request): Promise<{ userId: string } | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  return { userId: session.user.id };
}

function extractDraftId(pathname: string): string | null {
  if (!pathname.startsWith(WS_PATH_PREFIX)) return null;
  const draftId = pathname.slice(WS_PATH_PREFIX.length);
  return draftId || null;
}

Bun.serve<WsData>({
  port: env.PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const draftId = extractDraftId(url.pathname);

    if (draftId && req.headers.get('upgrade') === 'websocket') {
      const authResult = await authenticateWsRequest(req);
      if (!authResult) {
        return new Response('Unauthorized', { status: 401 });
      }

      const draftRecord = await draftsService.getByIdForOwner(draftId, authResult.userId);
      if (!draftRecord) {
        return new Response('Not Found', { status: 404 });
      }

      await collaborationService.getOrCreateRoom(draftId);

      const upgraded = server.upgrade(req, {
        data: { draftId, userId: authResult.userId } satisfies WsData,
      });

      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      collaborationService.handleConnection(ws, ws.data.draftId);
    },
    message(ws, message) {
      if (message instanceof ArrayBuffer) {
        collaborationService.handleMessage(ws, ws.data.draftId, message);
      } else if (typeof message === 'string') {
        collaborationService.handleMessage(ws, ws.data.draftId, Buffer.from(message));
      } else {
        collaborationService.handleMessage(ws, ws.data.draftId, message as Buffer);
      }
    },
    close(ws) {
      collaborationService.handleDisconnect(ws, ws.data.draftId);
    },
  },
});

console.log(`API server running at http://localhost:${env.PORT}`);
