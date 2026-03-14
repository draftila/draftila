import type { WSMessage } from '@draftila/shared';

interface Client {
  ws: WebSocket;
  userId: string;
  projectId: string;
}

const rooms = new Map<string, Set<Client>>();

export function handleWSUpgrade(ws: WebSocket, userId: string, projectId: string) {
  const client: Client = { ws, userId, projectId };

  // Join room
  if (!rooms.has(projectId)) {
    rooms.set(projectId, new Set());
  }
  rooms.get(projectId)!.add(client);

  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data as string) as WSMessage;
      // Broadcast to all other clients in the same room
      broadcastToRoom(projectId, message, userId);
    } catch {
      // Invalid message, ignore
    }
  });

  ws.addEventListener('close', () => {
    rooms.get(projectId)?.delete(client);
    if (rooms.get(projectId)?.size === 0) {
      rooms.delete(projectId);
    }
  });
}

function broadcastToRoom(projectId: string, message: WSMessage, excludeUserId: string) {
  const room = rooms.get(projectId);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const client of room) {
    if (client.userId !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}
