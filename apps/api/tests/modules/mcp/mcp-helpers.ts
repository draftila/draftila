import { resetRateLimitStore } from '../../../src/common/middleware/rate-limit';
import { db } from '../../../src/db';
import * as draftsService from '../../../src/modules/drafts/drafts.service';
import * as projectsService from '../../../src/modules/projects/projects.service';
import { authenticateMcpToken, createMcpToken } from '../../../src/modules/mcp/mcp-token.service';
import { mcpCanvasOpSchema, type McpCanvasOp } from '@draftila/shared';
import { expect } from 'bun:test';
import { cleanDatabase, createTestUser, getAuthHeaders } from '../../helpers';

export interface McpTestContext {
  userId: string;
  authHeaders: Headers;
  projectId: string;
  draftId: string;
}

export async function setupMcpTests(): Promise<McpTestContext> {
  await cleanDatabase();
  resetRateLimitStore('sign-in');
  resetRateLimitStore('sign-up');
  resetRateLimitStore('mcp-auth');
  const created = await createTestUser();
  const userId = created.user.id;
  const authHeaders = await getAuthHeaders('test@draftila.com', 'password123');

  const project = await projectsService.create({ name: 'MCP Project', ownerId: userId });
  const draft = await draftsService.create({ name: 'MCP Draft', projectId: project.id });

  return { userId, authHeaders, projectId: project.id, draftId: draft.id };
}

export async function resetMcpState(draftId: string) {
  await db.mcpAccessToken.deleteMany();
  await db.draft.updateMany({ where: { id: draftId }, data: { yjsState: null } });
  resetRateLimitStore('mcp-auth');
}

export async function createTokenSecret(
  ownerId: string,
  scopes: Array<'mcp:projects:read' | 'mcp:drafts:read' | 'mcp:canvas:read' | 'mcp:canvas:write'>,
) {
  const created = await createMcpToken({
    ownerId,
    name: 'Server Token',
    scopes,
    expiresInDays: 30,
  });
  const auth = await authenticateMcpToken(created.secret);
  expect(auth).not.toBeNull();
  return created.secret;
}

export function parseCanvasOp(input: unknown): McpCanvasOp | null {
  const direct = mcpCanvasOpSchema.safeParse(input);
  if (direct.success) {
    if (
      direct.data.type === 'duplicate_shapes' &&
      direct.data.refs &&
      direct.data.refs.length !== direct.data.ids.length
    ) {
      return null;
    }
    return direct.data;
  }
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const rawType =
    (typeof raw.type === 'string' ? raw.type : null) ??
    (typeof raw.action === 'string' ? raw.action : null) ??
    (typeof raw.operation === 'string' ? raw.operation : null);
  if (!rawType) return null;
  const normalizedType = (() => {
    if (rawType === 'create' || rawType === 'insert' || rawType === 'create_shape')
      return 'add_shape' as const;
    if (rawType === 'update' || rawType === 'patch_shape') return 'update_shape' as const;
    if (rawType === 'delete' || rawType === 'remove' || rawType === 'delete_shape')
      return 'delete_shapes' as const;
    if (rawType === 'move' || rawType === 'move_shapes') return 'move_stack' as const;
    if (rawType === 'group') return 'group_shapes' as const;
    if (rawType === 'ungroup') return 'ungroup_shapes' as const;
    if (rawType === 'duplicate' || rawType === 'clone' || rawType === 'copy_shapes')
      return 'duplicate_shapes' as const;
    return rawType;
  })();
  const shapeTypeValue =
    (typeof raw.shapeType === 'string' ? raw.shapeType : null) ??
    (typeof raw.kind === 'string' ? raw.kind : null) ??
    (typeof raw.shape === 'string' ? raw.shape : null);
  const propsValue =
    (raw.props && typeof raw.props === 'object' ? raw.props : null) ??
    (raw.properties && typeof raw.properties === 'object' ? raw.properties : null) ??
    (raw.data && typeof raw.data === 'object' ? raw.data : null) ??
    undefined;
  const idValue =
    (typeof raw.id === 'string' ? raw.id : null) ??
    (typeof raw.shapeId === 'string' ? raw.shapeId : null);
  const idsValue = Array.isArray(raw.ids)
    ? raw.ids.filter((item): item is string => typeof item === 'string')
    : undefined;
  const knownOpKeys = new Set([
    'type',
    'action',
    'operation',
    'shapeType',
    'ref',
    'kind',
    'shape',
    'props',
    'properties',
    'data',
    'id',
    'shapeId',
    'ids',
    'offset',
    'refs',
    'direction',
    'draftId',
    'op',
    'ops',
  ]);
  const topLevelProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (knownOpKeys.has(key)) continue;
    topLevelProps[key] = value;
  }
  const mergedProps =
    Object.keys(topLevelProps).length > 0
      ? { ...(propsValue ?? {}), ...topLevelProps }
      : propsValue;
  const candidate: Record<string, unknown> = { type: normalizedType };
  if (normalizedType === 'add_shape') {
    candidate.shapeType = shapeTypeValue;
    if (typeof raw.ref === 'string') candidate.ref = raw.ref;
    if (mergedProps) candidate.props = mergedProps;
  }
  if (normalizedType === 'update_shape') {
    candidate.id = idValue;
    candidate.props = mergedProps;
  }
  if (
    normalizedType === 'delete_shapes' ||
    normalizedType === 'group_shapes' ||
    normalizedType === 'ungroup_shapes'
  ) {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
  }
  if (normalizedType === 'move_stack') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    candidate.direction = raw.direction;
  }
  if (normalizedType === 'duplicate_shapes') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    if (raw.offset && typeof raw.offset === 'object') candidate.offset = raw.offset;
    if (Array.isArray(raw.refs))
      candidate.refs = raw.refs.filter((item): item is string => typeof item === 'string');
    if (
      Array.isArray(candidate.ids) &&
      Array.isArray(candidate.refs) &&
      candidate.ids.length !== candidate.refs.length
    )
      return null;
  }
  const parsedCandidate = mcpCanvasOpSchema.safeParse(candidate);
  if (!parsedCandidate.success) return null;
  return parsedCandidate.data;
}

export function parseOpsFromArgs(args: Record<string, unknown>): McpCanvasOp[] {
  const rawOps = Array.isArray(args.ops) ? args.ops : args.op !== undefined ? [args.op] : null;
  if (!rawOps || rawOps.length === 0 || rawOps.length > 100) {
    throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
  }
  const normalizedOps: McpCanvasOp[] = [];
  for (const rawOp of rawOps) {
    const parsedOp = parseCanvasOp(rawOp);
    if (!parsedOp) {
      throw new Error('Invalid tool arguments: expected { draftId: string, ops: McpCanvasOp[] }');
    }
    normalizedOps.push(parsedOp);
  }
  return normalizedOps;
}
