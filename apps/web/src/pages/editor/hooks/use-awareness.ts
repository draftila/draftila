import { useEffect, useState, useCallback, useRef } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type { ToolType, Point } from '@draftila/shared';

const CURSOR_THROTTLE_MS = 33;

export interface RemoteUser {
  clientId: number;
  user: { id: string; name: string; color: string };
  cursor: Point | null;
  selectedIds: string[];
  activeTool: ToolType;
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areRemoteUsersEqual(a: RemoteUser[], b: RemoteUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.clientId !== right.clientId) return false;
    if (left.user.id !== right.user.id) return false;
    if (left.user.name !== right.user.name) return false;
    if (left.user.color !== right.user.color) return false;
    if ((left.cursor === null) !== (right.cursor === null)) return false;
    if (left.cursor && right.cursor) {
      if (left.cursor.x !== right.cursor.x || left.cursor.y !== right.cursor.y) return false;
    }
    if (!areStringArraysEqual(left.selectedIds, right.selectedIds)) return false;
    if (left.activeTool !== right.activeTool) return false;
  }
  return true;
}

const CURSOR_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
];

function getColorForIndex(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length]!;
}

export function useAwareness(provider: WebsocketProvider | null, userId: string, userName: string) {
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const remoteUsersRef = useRef<RemoteUser[]>([]);
  remoteUsersRef.current = remoteUsers;

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    const clientId = awareness.clientID;

    const colorIndex = clientId % CURSOR_COLORS.length;
    awareness.setLocalStateField('user', {
      id: userId,
      name: userName,
      color: getColorForIndex(colorIndex),
    });

    const handleChange = () => {
      const states = Array.from(awareness.getStates().entries());
      const users: RemoteUser[] = [];

      for (const [id, state] of states) {
        if (id === clientId) continue;
        if (!state.user) continue;

        users.push({
          clientId: id,
          user: state.user as { id: string; name: string; color: string },
          cursor: (state.cursor as Point) ?? null,
          selectedIds: (state.selectedIds as string[]) ?? [],
          activeTool: (state.activeTool as ToolType) ?? 'move',
        });
      }

      users.sort((a, b) => a.clientId - b.clientId);
      setRemoteUsers((prev) => (areRemoteUsersEqual(prev, users) ? prev : users));
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [provider, userId, userName]);

  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursorRef = useRef<Point | null>(null);

  const updateCursor = useCallback(
    (cursor: Point | null) => {
      if (!provider) return;

      if (cursor === null) {
        if (cursorTimerRef.current) {
          clearTimeout(cursorTimerRef.current);
          cursorTimerRef.current = null;
        }
        pendingCursorRef.current = null;
        provider.awareness.setLocalStateField('cursor', null);
        return;
      }

      if (remoteUsersRef.current.length === 0) {
        return;
      }

      pendingCursorRef.current = cursor;
      if (cursorTimerRef.current) return;

      provider.awareness.setLocalStateField('cursor', cursor);
      cursorTimerRef.current = setTimeout(() => {
        cursorTimerRef.current = null;
        if (pendingCursorRef.current) {
          provider.awareness.setLocalStateField('cursor', pendingCursorRef.current);
        }
      }, CURSOR_THROTTLE_MS);
    },
    [provider],
  );

  const updateSelection = useCallback(
    (selectedIds: string[]) => {
      if (!provider) return;
      provider.awareness.setLocalStateField('selectedIds', selectedIds);
    },
    [provider],
  );

  const updateActiveTool = useCallback(
    (tool: ToolType) => {
      if (!provider) return;
      provider.awareness.setLocalStateField('activeTool', tool);
    },
    [provider],
  );

  useEffect(() => {
    return () => {
      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current);
      }
    };
  }, []);

  return {
    remoteUsers,
    updateCursor,
    updateSelection,
    updateActiveTool,
  };
}
