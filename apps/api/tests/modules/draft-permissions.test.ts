import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { COLLABORATION_ACCESS_CHANGED, COLLABORATION_ACCESS_MESSAGE } from '@draftila/shared';
import {
  ensureDefaultPage,
  getCommentPin,
  addPage,
  setActivePage,
  getActivePageId,
} from '@draftila/engine';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { ForbiddenError, NotFoundError } from '../../src/common/errors';
import { resetRateLimitStore } from '../../src/common/middleware/rate-limit';
import { getDraftAccess, requireDraftAccess } from '../../src/modules/drafts/drafts.access';
import * as draftsService from '../../src/modules/drafts/drafts.service';
import * as membersService from '../../src/modules/projects/members.service';
import {
  canInvite,
  canManageMembers,
  canEdit,
  canDelete,
} from '../../src/modules/projects/project-permissions';
import * as collaboration from '../../src/modules/collaboration/collaboration.service';
import * as apiKeysService from '../../src/modules/api-keys/api-keys.service';
import { sendToolRpc } from '../../src/modules/mcp/mcp.auth';
import { initServerRpc } from '../../src/modules/mcp/server-rpc';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../helpers';

const roles = ['owner', 'admin', 'editor', 'viewer', 'outsider'] as const;
type Role = (typeof roles)[number];
const users = new Map<Role, string>();
const projectId = 'permissions-project';
const draftId = 'permissions-draft';

class TestSocket {
  messages: Uint8Array[] = [];
  closeCode: number | undefined;

  send(data: Uint8Array | ArrayBuffer | string) {
    if (typeof data !== 'string') this.messages.push(new Uint8Array(data));
  }

  close(code?: number) {
    this.closeCode = code;
  }
}

beforeEach(async () => {
  collaboration.closeAllRooms();
  collaboration.setRpcInterceptor(null);
  await cleanDatabase();
  users.clear();
  resetRateLimitStore('api-general');
  resetRateLimitStore('mcp');
  resetRateLimitStore('sign-in');
  for (const role of roles) {
    resetRateLimitStore('sign-up');
    const result = await createTestUser({
      email: `${role}@permissions.test`,
      name: role,
      password: 'password123',
    });
    users.set(role, result.user.id);
  }
  await db.project.create({
    data: { id: projectId, name: 'Permissions', ownerId: users.get('owner')! },
  });
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    await db.projectMember.create({
      data: { id: `member-${role}`, projectId, userId: users.get(role)!, role },
    });
  }
  await db.draft.create({ data: { id: draftId, projectId, name: 'Permissions' } });
});

afterEach(() => {
  collaboration.closeAllRooms();
  collaboration.setRpcInterceptor(null);
});

async function headersFor(role: Role) {
  const headers = await getAuthHeaders(`${role}@permissions.test`, 'password123');
  headers.set('Content-Type', 'application/json');
  return headers;
}

async function connect(role: Role) {
  const ws = new TestSocket();
  await collaboration.handleConnection(ws, draftId, {
    draftId,
    projectId,
    userId: users.get(role)!,
  });
  return ws;
}

function syncMessage(type: 'update' | 'step2', doc: Y.Doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  if (type === 'update') syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
  else syncProtocol.writeSyncStep2(encoder, doc);
  return Buffer.from(encoding.toUint8Array(encoder));
}

async function seedSnapshot() {
  const doc = new Y.Doc();
  doc.getMap('meta').set('version', 'original');
  const snapshot = await db.snapshot.create({
    data: {
      id: 'permissions-snapshot',
      draftId,
      userId: users.get('owner')!,
      name: 'Original',
      yjsState: new Uint8Array(Y.encodeStateAsUpdate(doc)),
    },
  });
  doc.getMap('meta').set('version', 'current');
  await draftsService.saveYjsState(draftId, Buffer.from(Y.encodeStateAsUpdate(doc)));
  doc.destroy();
  return snapshot;
}

describe('draft access policy', () => {
  test('project capabilities match the role matrix', () => {
    for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
      expect(canInvite(role)).toBe(role === 'owner' || role === 'admin');
      expect(canManageMembers(role)).toBe(role === 'owner' || role === 'admin');
      expect(canEdit(role)).toBe(role !== 'viewer');
      expect(canDelete(role)).toBe(role === 'owner' || role === 'admin');
    }
  });
  test('resolves every role and fails closed for missing drafts, nonmembers, and invalid roles', async () => {
    for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
      const access = await requireDraftAccess(draftId, users.get(role)!);
      expect(access).toEqual({
        projectId,
        role,
        canEdit: role !== 'viewer',
        canDelete: role === 'owner' || role === 'admin',
      });
    }
    expect(await getDraftAccess('missing', users.get('owner')!)).toBeNull();
    expect(await getDraftAccess(draftId, users.get('outsider')!)).toBeNull();
    await expect(requireDraftAccess(draftId, users.get('outsider')!)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(requireDraftAccess(draftId, users.get('viewer')!, 'edit')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      requireDraftAccess(draftId, users.get('editor')!, 'delete'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await requireDraftAccess(draftId, users.get('admin')!, 'delete')).canDelete).toBe(true);
    expect((await requireDraftAccess(draftId, users.get('editor')!, 'edit')).canEdit).toBe(true);
    await db.projectMember.update({ where: { id: 'member-viewer' }, data: { role: 'invalid' } });
    expect(await getDraftAccess(draftId, users.get('viewer')!)).toBeNull();
  });
});

describe('REST draft permissions', () => {
  test('viewers can read snapshots but cannot create, rename, restore, or upload a thumbnail', async () => {
    const snapshot = await seedSnapshot();
    const headers = await headersFor('viewer');
    for (const path of [
      `/api/drafts/${draftId}`,
      `/api/drafts/${draftId}/snapshots`,
      `/api/snapshots/${snapshot.id}/state`,
    ]) {
      expect((await app.request(path, { headers })).status).toBe(200);
    }
    const cases = [
      { path: `/api/drafts/${draftId}/snapshots`, method: 'POST', body: { name: 'Unauthorized' } },
      { path: `/api/snapshots/${snapshot.id}`, method: 'PATCH', body: { name: 'Unauthorized' } },
      { path: `/api/snapshots/${snapshot.id}/restore`, method: 'POST', body: {} },
      { path: `/api/drafts/${draftId}/thumbnail`, method: 'PUT', body: {} },
    ];
    const before = await draftsService.loadFullYjsState(draftId);
    for (const entry of cases) {
      const res = await app.request(entry.path, {
        method: entry.method,
        headers,
        body: JSON.stringify(entry.body),
      });
      expect(res.status).toBe(403);
    }
    expect(await db.snapshot.count({ where: { draftId } })).toBe(1);
    expect((await db.snapshot.findUnique({ where: { id: snapshot.id } }))?.name).toBe('Original');
    expect(await draftsService.loadFullYjsState(draftId)).toEqual(before);
  });

  for (const role of ['owner', 'admin', 'editor'] as const) {
    test(`${role} can create, rename, and restore snapshots`, async () => {
      const snapshot = await seedSnapshot();
      const headers = await headersFor(role);
      expect(
        (
          await app.request(`/api/drafts/${draftId}/snapshots`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: 'Version' }),
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await app.request(`/api/snapshots/${snapshot.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ name: 'Renamed' }),
          })
        ).status,
      ).toBe(200);
      expect(
        (await app.request(`/api/snapshots/${snapshot.id}/restore`, { method: 'POST', headers }))
          .status,
      ).toBe(200);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array((await draftsService.loadFullYjsState(draftId))!));
      expect(doc.getMap('meta').get('version')).toBe('original');
      doc.destroy();
    });
  }

  test('outsiders and anonymous users cannot access snapshots', async () => {
    const snapshot = await seedSnapshot();
    expect(
      (
        await app.request(`/api/snapshots/${snapshot.id}/restore`, {
          method: 'POST',
          headers: await headersFor('outsider'),
        })
      ).status,
    ).toBe(404);
    expect((await app.request(`/api/snapshots/${snapshot.id}/state`)).status).toBe(401);
  });
});

describe('MCP permissions', () => {
  test('viewers retain explicit read tools, while writes and unknown tools fail before dispatch', async () => {
    const dispatched: string[] = [];
    collaboration.setRpcInterceptor(async (_draftId, tool) => {
      dispatched.push(tool);
      return { ok: true };
    });
    const reads = [
      'get_shape',
      'list_shapes',
      'find_shapes',
      'list_pages',
      'list_components',
      'list_guides',
      'list_variables',
      'list_icons',
      'export_svg',
      'export_png',
      'export_html',
      'export_css',
      'export_css_all_layers',
      'export_tailwind',
      'export_tailwind_all_layers',
      'export_swiftui',
      'export_compose',
    ];
    for (const tool of reads) await sendToolRpc(draftId, users.get('viewer')!, tool, {});
    expect(dispatched).toEqual(reads);
    for (const tool of [
      'create_shape',
      'update_shape',
      'delete_shapes',
      'batch_create_shapes',
      'batch_update_shapes',
      'import_html',
      'import_svg',
      'add_page',
      'remove_page',
      'rename_page',
      'set_active_page',
      'set_page_background',
      'create_component',
      'create_instance',
      'remove_component',
      'add_guide',
      'remove_guide',
      'set_variable',
      'delete_variable',
      'bind_variable',
      'unbind_variable',
      'insert_icon',
      'group_shapes',
      'ungroup_shapes',
      'frame_selection',
      'align_shapes',
      'distribute_shapes',
      'apply_auto_layout',
      'nudge_shapes',
      'flip_shapes',
      'move_in_stack',
      'move_by_drop',
      'boolean_operation',
      'duplicate_shapes',
      'future_tool',
    ]) {
      await expect(sendToolRpc(draftId, users.get('viewer')!, tool, {})).rejects.toThrow(
        'not permitted',
      );
    }
    expect(dispatched).toEqual(reads);
    for (const role of ['owner', 'admin', 'editor'] as const)
      await sendToolRpc(draftId, users.get(role)!, 'create_shape', {});
    expect(dispatched.slice(-3)).toEqual(['create_shape', 'create_shape', 'create_shape']);
    await expect(sendToolRpc(draftId, users.get('outsider')!, 'list_shapes', {})).rejects.toThrow(
      'access denied',
    );
  });

  test('the HTTP MCP endpoint rejects viewer writes with no document mutations', async () => {
    initServerRpc();
    const key = await apiKeysService.create(users.get('viewer')!, 'Viewer');
    const room = await collaboration.getOrCreateRoom(draftId);
    const before = Y.encodeStateAsUpdate(room.ydoc);
    for (const [name, args] of [
      ['create_shape', { type: 'rectangle' }],
      ['update_shape', { shapeId: 'shape', props: { x: 999 } }],
      ['delete_shapes', { shapeIds: ['shape'] }],
    ] as const) {
      const res = await app.request('/api/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key.key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: name,
          method: 'tools/call',
          params: { name, arguments: { draftId, ...args } },
        }),
      });
      const body = (await res.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0]?.text).toContain('not permitted');
    }
    expect(Y.encodeStateAsUpdate(room.ydoc)).toEqual(before);
  });
});

describe('WebSocket permissions', () => {
  test('viewers synchronize and publish awareness without applying either update type', async () => {
    const ws = await connect('viewer');
    const room = await collaboration.getOrCreateRoom(draftId);
    const permission = decoding.createDecoder(ws.messages[0]!);
    expect(decoding.readVarUint(permission)).toBe(COLLABORATION_ACCESS_MESSAGE);
    expect(JSON.parse(decoding.readVarString(permission))).toEqual({ canEdit: false });
    const client = new Y.Doc();
    const sync = encoding.createEncoder();
    encoding.writeVarUint(sync, 0);
    syncProtocol.writeSyncStep1(sync, client);
    await collaboration.handleMessage(ws, draftId, Buffer.from(encoding.toUint8Array(sync)));
    const response = decoding.createDecoder(ws.messages.at(-1)!);
    expect(decoding.readVarUint(response)).toBe(0);
    syncProtocol.readSyncMessage(response, encoding.createEncoder(), client, null);
    expect(Y.encodeStateAsUpdate(client)).toEqual(Y.encodeStateAsUpdate(room.ydoc));
    const before = Y.encodeStateAsUpdate(room.ydoc);
    client.getMap('meta').set('unauthorized', true);
    for (const type of ['update', 'step2'] as const)
      await collaboration.handleMessage(ws, draftId, syncMessage(type, client));
    expect(Y.encodeStateAsUpdate(room.ydoc)).toEqual(before);
    const awareness = new awarenessProtocol.Awareness(client);
    awareness.setLocalState({ user: { name: 'Viewer' } });
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, [client.clientID]),
    );
    await collaboration.handleMessage(ws, draftId, Buffer.from(encoding.toUint8Array(encoder)));
    expect(room.awareness.getStates().get(client.clientID)).toEqual({ user: { name: 'Viewer' } });
    awareness.destroy();
    client.destroy();
  });

  for (const role of ['owner', 'admin', 'editor'] as const) {
    test(`${role} can apply both update types`, async () => {
      const ws = await connect(role);
      const room = await collaboration.getOrCreateRoom(draftId);
      const client = new Y.Doc();
      for (const type of ['update', 'step2'] as const) {
        client.getMap('meta').set(type, role);
        await collaboration.handleMessage(ws, draftId, syncMessage(type, client));
        expect(room.ydoc.getMap('meta').get(type)).toBe(role);
      }
      client.destroy();
    });
  }

  test('downgrades and removals revoke existing connections and reconnect with current permissions', async () => {
    const ws = await connect('editor');
    const room = await collaboration.getOrCreateRoom(draftId);
    await membersService.updateRole(projectId, 'member-editor', 'viewer', users.get('owner')!);
    expect(ws.closeCode).toBe(COLLABORATION_ACCESS_CHANGED);
    expect(collaboration.getConnectionCount(draftId)).toBe(0);
    const client = new Y.Doc();
    client.getMap('meta').set('revoked', true);
    await collaboration.handleMessage(ws, draftId, syncMessage('update', client));
    expect(room.ydoc.getMap('meta').has('revoked')).toBe(false);
    const reconnected = await connect('editor');
    await collaboration.handleMessage(reconnected, draftId, syncMessage('step2', client));
    expect(room.ydoc.getMap('meta').has('revoked')).toBe(false);
    await membersService.removeMember(projectId, 'member-editor', users.get('owner')!);
    expect(reconnected.closeCode).toBe(COLLABORATION_ACCESS_CHANGED);
    const messagesBefore = reconnected.messages.length;
    room.ydoc.getMap('meta').set('private', true);
    expect(reconnected.messages.length).toBe(messagesBefore);
    const removed = await connect('editor');
    expect(removed.closeCode).toBe(COLLABORATION_ACCESS_CHANGED);
    client.destroy();
  });

  test('unregistered sockets, outsiders, and cross-draft messages cannot mutate a room', async () => {
    const room = await collaboration.getOrCreateRoom(draftId);
    const client = new Y.Doc();
    client.getMap('meta').set('unauthorized', true);
    await collaboration.handleMessage(new TestSocket(), draftId, syncMessage('update', client));
    const outsider = await connect('outsider');
    await collaboration.handleMessage(outsider, draftId, syncMessage('update', client));
    const owner = await connect('owner');
    await collaboration.handleMessage(owner, 'other-draft', syncMessage('update', client));
    expect(room.ydoc.getMap('meta').has('unauthorized')).toBe(false);
    client.destroy();
  });
});

describe('viewer comments', () => {
  test('viewers can create, move, reply, resolve, and delete comments through authorized APIs', async () => {
    await connect('viewer');
    const room = await collaboration.getOrCreateRoom(draftId);
    const pageId = ensureDefaultPage(room.ydoc);
    const headers = await headersFor('viewer');
    const create = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pageId,
        content: 'Viewer comment',
        placement: { x: 10, y: 20, parentShapeId: null },
      }),
    });
    expect(create.status).toBe(201);
    const comment = (await create.json()) as { id: string };
    expect(getCommentPin(room.ydoc, comment.id)).toMatchObject({
      x: 10,
      y: 20,
      userId: users.get('viewer'),
      userName: 'viewer',
    });
    expect(
      (
        await app.request(`/api/comments/${comment.id}/pin`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ x: 30, y: 40, parentShapeId: null }),
        })
      ).status,
    ).toBe(200);
    expect(getCommentPin(room.ydoc, comment.id)).toMatchObject({ x: 30, y: 40 });
    expect(
      (
        await app.request(`/api/comments/${comment.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ content: 'Edited comment' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/drafts/${draftId}/comments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ pageId, parentId: comment.id, content: 'Reply' }),
        })
      ).status,
    ).toBe(201);
    expect(
      (await app.request(`/api/comments/${comment.id}/resolve`, { method: 'POST', headers }))
        .status,
    ).toBe(200);
    expect(
      (await app.request(`/api/comments/${comment.id}`, { method: 'DELETE', headers })).status,
    ).toBe(200);
    expect(getCommentPin(room.ydoc, comment.id)).toBeNull();
    expect(await db.comment.count({ where: { draftId } })).toBe(0);
  });

  test('pin commands cannot target other pages, missing shapes, or bypass comment access', async () => {
    await connect('viewer');
    const room = await collaboration.getOrCreateRoom(draftId);
    const pageId = ensureDefaultPage(room.ydoc);
    const headers = await headersFor('viewer');
    for (const placement of [
      { x: 10, y: 20, parentShapeId: 'missing' },
      { x: 'invalid', y: 20, parentShapeId: null },
    ]) {
      const res = await app.request(`/api/drafts/${draftId}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pageId, content: 'Invalid pin', placement }),
      });
      expect([400, 404]).toContain(res.status);
    }
    const res = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pageId: 'missing',
        content: 'Invalid page',
        placement: { x: 1, y: 2, parentShapeId: null },
      }),
    });
    expect(res.status).toBe(404);
    expect(await db.comment.count()).toBe(0);
    const created = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pageId,
        content: 'Valid',
        placement: { x: 1, y: 2, parentShapeId: null },
      }),
    });
    const comment = (await created.json()) as { id: string };
    expect(
      (
        await app.request(`/api/comments/${comment.id}/pin`, {
          method: 'PATCH',
          headers: await headersFor('outsider'),
          body: JSON.stringify({ x: 99, y: 99, parentShapeId: null }),
        })
      ).status,
    ).toBe(404);
    expect(getCommentPin(room.ydoc, comment.id)?.x).toBe(1);
  });
});

describe('permission and room lifecycle races', () => {
  test('revocation and disconnect cancel admission before authorization completes', async () => {
    const revoked = new TestSocket();
    const admission = collaboration.handleConnection(revoked, draftId, {
      draftId,
      projectId,
      userId: users.get('editor')!,
    });
    collaboration.revokeProjectConnections(projectId, users.get('editor')!);
    await admission;
    expect(revoked.closeCode).toBe(COLLABORATION_ACCESS_CHANGED);
    expect(collaboration.getConnectionCount(draftId)).toBe(0);
    expect(revoked.messages).toHaveLength(1);
    const disconnected = new TestSocket();
    const pending = collaboration.handleConnection(disconnected, draftId, {
      draftId,
      projectId,
      userId: users.get('owner')!,
    });
    await collaboration.handleDisconnect(disconnected, draftId);
    await pending;
    expect(disconnected.messages).toHaveLength(0);
    expect(collaboration.getConnectionCount(draftId)).toBe(0);
  });

  test('messages arriving during admission wait for authorization', async () => {
    const ws = new TestSocket();
    const client = new Y.Doc();
    client.getMap('meta').set('early', true);
    const admission = collaboration.handleConnection(ws, draftId, {
      draftId,
      projectId,
      userId: users.get('viewer')!,
    });
    await collaboration.handleMessage(ws, draftId, syncMessage('step2', client));
    await admission;
    expect(collaboration.getRoomYDoc(draftId)?.getMap('meta').has('early')).toBe(false);
    client.destroy();
  });

  test('concurrent room users share one document and active operations prevent closing it', async () => {
    const [first, second] = await Promise.all([
      collaboration.getOrCreateRoom(draftId),
      collaboration.getOrCreateRoom(draftId),
    ]);
    expect(first).toBe(second);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const operation = collaboration.withRoom(draftId, async (ydoc) => {
      started();
      await gate;
      ydoc.getMap('meta').set('comment-operation', true);
    });
    await ready;
    await collaboration.closeRoom(draftId);
    expect(collaboration.getRoomYDoc(draftId)).toBe(first.ydoc);
    release();
    await operation;
    expect(collaboration.getRoomYDoc(draftId)).toBeNull();
    const reopened = await collaboration.getOrCreateRoom(draftId);
    expect(reopened.ydoc.getMap('meta').get('comment-operation')).toBe(true);
  });

  test('invalid comment placements release rooms without creating SQL comments', async () => {
    const response = await app.request(`/api/drafts/${draftId}/comments`, {
      method: 'POST',
      headers: await headersFor('viewer'),
      body: JSON.stringify({
        pageId: 'missing',
        content: 'Invalid',
        placement: { x: 1, y: 2, parentShapeId: null },
      }),
    });
    expect(response.status).toBe(404);
    expect(collaboration.getRoomYDoc(draftId)).toBeNull();
    expect(await db.comment.count()).toBe(0);
  });
});

describe('review regressions', () => {
  test('a comment cannot evict an MCP operation or its retained page context', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let pageId = '';
    const mcp = collaboration.withRoom(
      draftId,
      async (ydoc) => {
        ensureDefaultPage(ydoc);
        pageId = addPage(ydoc, 'MCP page');
        setActivePage(ydoc, pageId);
        started();
        await gate;
        expect(ydoc.isDestroyed).toBe(false);
        ydoc.getMap('meta').set('late-mcp-write', true);
      },
      { retainForMs: 300_000 },
    );
    await ready;
    await collaboration.withRoom(draftId, (ydoc) => {
      ydoc.getMap('meta').set('comment', true);
    });
    release();
    await mcp;
    await collaboration.withRoom(draftId, (ydoc) => {
      ydoc.getMap('meta').set('second-comment', true);
    });
    const retained = collaboration.getRoomYDoc(draftId)!;
    expect(retained.isDestroyed).toBe(false);
    expect(getActivePageId(retained)).toBe(pageId);
    await expireRetainedRoom();
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, new Uint8Array((await draftsService.loadYjsState(draftId))!));
    expect(persisted.getMap('meta').get('late-mcp-write')).toBe(true);
    persisted.destroy();
  });

  test('the production MCP handler retains active-page context across comment operations', async () => {
    initServerRpc();
    const page = (await sendToolRpc(draftId, users.get('editor')!, 'add_page', {
      name: 'MCP target',
    })) as { pageId: string };
    await sendToolRpc(draftId, users.get('editor')!, 'set_active_page', { pageId: page.pageId });
    const before = collaboration.getRoomYDoc(draftId);
    await collaboration.withRoom(draftId, (ydoc) => {
      ydoc.getMap('meta').set('comment', true);
    });
    expect(collaboration.getRoomYDoc(draftId)).toBe(before);
    expect(getActivePageId(collaboration.getRoomYDoc(draftId)!)).toBe(page.pageId);
  });

  test('a lease racing idle closure always receives a live persistent document', async () => {
    await collaboration.getOrCreateRoom(draftId);
    const closing = collaboration.closeRoom(draftId);
    const operation = collaboration.withRoom(draftId, (ydoc) => {
      expect(ydoc.isDestroyed).toBe(false);
      ydoc.getMap('meta').set('racing-comment', true);
    });
    await Promise.all([closing, operation]);
    const reopened = await collaboration.getOrCreateRoom(draftId);
    expect(reopened.ydoc.getMap('meta').get('racing-comment')).toBe(true);
  });

  test('last disconnect queues an auto-save until the pending comment finishes', async () => {
    const ws = await connect('editor');
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const operation = collaboration.withRoom(draftId, async (ydoc) => {
      ydoc.getMap('meta').set('design-edit', true);
      started();
      await gate;
      ydoc.getMap('meta').set('comment', true);
    });
    await ready;
    await collaboration.handleDisconnect(ws, draftId);
    expect(await db.snapshot.count({ where: { draftId } })).toBe(0);
    release();
    await operation;
    const snapshots = await db.snapshot.findMany({ where: { draftId } });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.userId).toBe(users.get('editor')!);
    const saved = new Y.Doc();
    Y.applyUpdate(saved, new Uint8Array(snapshots[0]!.yjsState));
    expect(saved.getMap('meta').toJSON()).toMatchObject({ 'design-edit': true, comment: true });
    saved.destroy();
  });
});

async function expireRetainedRoom() {
  const clock = spyOn(Date, 'now').mockReturnValue(Date.now() + 300_001);
  try {
    await collaboration.closeRoom(draftId);
  } finally {
    clock.mockRestore();
  }
}

describe('retained room persistence', () => {
  test('socketless MCP writes remain buffered until the existing idle persistence boundary', async () => {
    initServerRpc();
    for (let i = 0; i < 3; i += 1) {
      await sendToolRpc(draftId, users.get('editor')!, 'create_shape', {
        type: 'rectangle',
        props: { x: i * 100 },
      });
    }
    expect(await draftsService.loadYjsState(draftId)).toBeNull();
    expect(await db.draftUpdate.count({ where: { draftId } })).toBe(0);
    const before = Y.encodeStateAsUpdate(collaboration.getRoomYDoc(draftId)!);
    await expireRetainedRoom();
    expect(collaboration.getRoomYDoc(draftId)).toBeNull();
    expect(new Uint8Array((await draftsService.loadYjsState(draftId))!)).toEqual(
      new Uint8Array(before),
    );
  });

  test('a clean disconnect never attributes later MCP edits to the departed viewer', async () => {
    await collaboration.withRoom(draftId, (ydoc) => {
      ensureDefaultPage(ydoc);
    });
    initServerRpc();
    await sendToolRpc(draftId, users.get('editor')!, 'list_pages', {});
    const ws = await connect('viewer');
    await collaboration.handleDisconnect(ws, draftId);
    expect(await db.snapshot.count({ where: { draftId } })).toBe(0);
    expect((await collaboration.getOrCreateRoom(draftId)).autoSaveUserId).toBeNull();
    await sendToolRpc(draftId, users.get('editor')!, 'create_shape', { type: 'rectangle' });
    await expireRetainedRoom();
    expect(await db.snapshot.count({ where: { draftId } })).toBe(0);
  });
});
