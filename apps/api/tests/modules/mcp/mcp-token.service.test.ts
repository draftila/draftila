import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  authenticateMcpToken,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '../../../src/modules/mcp/mcp-token.service';
import { type McpTestContext, setupMcpTests, resetMcpState } from './mcp-helpers';

describe('mcp-token.service', () => {
  let ctx: McpTestContext;

  beforeAll(async () => {
    ctx = await setupMcpTests();
  });

  beforeEach(async () => {
    await resetMcpState(ctx.draftId);
  });

  test('createMcpToken stores token and returns secret once', async () => {
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Agent Token',
      scopes: ['mcp:projects:read', 'mcp:drafts:read', 'mcp:canvas:read'],
      expiresInDays: 90,
    });

    expect(created.secret.startsWith('dtk_')).toBe(true);
    expect(created.token.name).toBe('Agent Token');
    expect(created.token.scopes).toContain('mcp:canvas:read');
    expect(created.token.expiresAt).not.toBeNull();

    const auth = await authenticateMcpToken(created.secret);
    expect(auth).not.toBeNull();
    expect(auth!.ownerId).toBe(ctx.userId);
    expect(auth!.scopes.has('mcp:projects:read')).toBe(true);
  });

  test('authenticateMcpToken rejects malformed values', async () => {
    const result = await authenticateMcpToken('invalid-token');
    expect(result).toBeNull();
  });

  test('listMcpTokens returns owner tokens', async () => {
    await createMcpToken({
      ownerId: ctx.userId,
      name: 'Token One',
      scopes: ['mcp:projects:read'],
      expiresInDays: 30,
    });
    await createMcpToken({
      ownerId: ctx.userId,
      name: 'Token Two',
      scopes: ['mcp:drafts:read'],
      expiresInDays: 30,
    });

    const tokens = await listMcpTokens(ctx.userId);
    expect(tokens).toHaveLength(2);
    expect(tokens.map((token) => token.name).sort()).toEqual(['Token One', 'Token Two']);
  });

  test('revokeMcpToken revokes and blocks auth', async () => {
    const created = await createMcpToken({
      ownerId: ctx.userId,
      name: 'Revoke Token',
      scopes: ['mcp:projects:read'],
      expiresInDays: 30,
    });

    const revoked = await revokeMcpToken(created.token.id, ctx.userId);
    expect(revoked).toBe(true);

    const auth = await authenticateMcpToken(created.secret);
    expect(auth).toBeNull();
  });
});
