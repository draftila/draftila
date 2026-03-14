import { afterEach, describe, expect, test } from 'bun:test';
import { handleWSUpgrade } from '../../src/ws';

type EventCallback = (event: { data: string }) => void;
type CloseCallback = () => void;

interface MockWS extends WebSocket {
  emitted: string[];
  triggerMessage: (data: string) => void;
  triggerClose: () => void;
}

function createMockWS(): MockWS {
  const messageListeners: EventCallback[] = [];
  const closeListeners: CloseCallback[] = [];
  const emitted: string[] = [];

  const mock = {
    readyState: WebSocket.OPEN,
    emitted,
    addEventListener(event: string, cb: EventCallback | CloseCallback) {
      if (event === 'message') messageListeners.push(cb as EventCallback);
      if (event === 'close') closeListeners.push(cb as CloseCallback);
    },
    send(data: string) {
      emitted.push(data);
    },
    triggerMessage(data: string) {
      for (const cb of messageListeners) {
        cb({ data });
      }
    },
    triggerClose() {
      for (const cb of closeListeners) {
        cb();
      }
    },
  };

  return mock as unknown as MockWS;
}

describe('WebSocket room management', () => {
  const activeMocks: MockWS[] = [];

  afterEach(() => {
    for (const mock of activeMocks) {
      mock.triggerClose();
    }
    activeMocks.length = 0;
  });

  test('client joins a room and receives broadcasts from other clients', () => {
    const ws1 = createMockWS();
    const ws2 = createMockWS();
    activeMocks.push(ws1, ws2);

    handleWSUpgrade(ws1, 'user1', 'project1');
    handleWSUpgrade(ws2, 'user2', 'project1');

    ws1.triggerMessage(
      JSON.stringify({
        type: 'cursor:move',
        payload: { x: 10, y: 20 },
        userId: 'user1',
        timestamp: Date.now(),
      }),
    );

    expect(ws2.emitted).toHaveLength(1);
    const received = JSON.parse(ws2.emitted[0]!);
    expect(received.type).toBe('cursor:move');

    expect(ws1.emitted).toHaveLength(0);
  });

  test('messages are only broadcast within the same room', () => {
    const ws1 = createMockWS();
    const ws2 = createMockWS();
    activeMocks.push(ws1, ws2);

    handleWSUpgrade(ws1, 'user1', 'projectA');
    handleWSUpgrade(ws2, 'user2', 'projectB');

    ws1.triggerMessage(
      JSON.stringify({
        type: 'element:create',
        payload: {},
        userId: 'user1',
        timestamp: Date.now(),
      }),
    );

    expect(ws2.emitted).toHaveLength(0);
  });

  test('client is removed from room on close', () => {
    const ws1 = createMockWS();
    const ws2 = createMockWS();
    activeMocks.push(ws1, ws2);

    handleWSUpgrade(ws1, 'user1', 'project1');
    handleWSUpgrade(ws2, 'user2', 'project1');

    ws1.triggerClose();

    ws2.triggerMessage(
      JSON.stringify({
        type: 'element:update',
        payload: {},
        userId: 'user2',
        timestamp: Date.now(),
      }),
    );

    expect(ws1.emitted).toHaveLength(0);
  });

  test('invalid JSON messages are silently ignored', () => {
    const ws1 = createMockWS();
    const ws2 = createMockWS();
    activeMocks.push(ws1, ws2);

    handleWSUpgrade(ws1, 'user1', 'project1');
    handleWSUpgrade(ws2, 'user2', 'project1');

    ws1.triggerMessage('this is not json{{{');

    expect(ws2.emitted).toHaveLength(0);
  });

  test('does not send to clients with closed readyState', () => {
    const ws1 = createMockWS();
    const ws2 = createMockWS();
    activeMocks.push(ws1, ws2);

    handleWSUpgrade(ws1, 'user1', 'project1');
    handleWSUpgrade(ws2, 'user2', 'project1');

    Object.defineProperty(ws2, 'readyState', { value: WebSocket.CLOSED, writable: true });

    ws1.triggerMessage(
      JSON.stringify({
        type: 'element:delete',
        payload: {},
        userId: 'user1',
        timestamp: Date.now(),
      }),
    );

    expect(ws2.emitted).toHaveLength(0);
  });
});
