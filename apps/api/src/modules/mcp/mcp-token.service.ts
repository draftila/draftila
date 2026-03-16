import { createHash, timingSafeEqual } from 'node:crypto';
import type { McpToken, McpTokenScope } from '@draftila/shared';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';

const TOKEN_FORMAT_PREFIX = 'dtk';
const TOKEN_PREFIX_LENGTH = 12;
const TOKEN_SECRET_LENGTH = 40;

interface CreateMcpTokenInput {
  ownerId: string;
  name: string;
  scopes: McpTokenScope[];
  projectIds?: string[];
  draftIds?: string[];
  expiresInDays: number;
}

export interface McpTokenAuthContext {
  tokenId: string;
  ownerId: string;
  scopes: Set<McpTokenScope>;
  projectIds: Set<string> | null;
  draftIds: Set<string> | null;
}

function randomString(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);
}

function serializeStringList(values?: string[]) {
  if (!values || values.length === 0) return null;
  return JSON.stringify(Array.from(new Set(values)));
}

function parseStringList(value: string | null): string[] | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return null;
  const strings = parsed.filter((entry): entry is string => typeof entry === 'string');
  return strings.length > 0 ? strings : null;
}

function hashTokenValue(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function parseRawToken(rawToken: string): { tokenPrefix: string } | null {
  const matched = /^([a-z]+)_([^_]+)_(.+)$/.exec(rawToken);
  if (!matched) return null;
  const format = matched[1];
  const tokenPrefix = matched[2];
  if (format !== TOKEN_FORMAT_PREFIX || !tokenPrefix) return null;
  return { tokenPrefix };
}

function toScopeSet(scopes: string): Set<McpTokenScope> {
  const parsed = JSON.parse(scopes) as unknown;
  if (!Array.isArray(parsed)) return new Set();
  const result = new Set<McpTokenScope>();
  for (const value of parsed) {
    if (
      value === 'mcp:projects:read' ||
      value === 'mcp:drafts:read' ||
      value === 'mcp:canvas:read' ||
      value === 'mcp:canvas:write'
    ) {
      result.add(value);
    }
  }
  return result;
}

function toTokenResponse(token: {
  id: string;
  name: string;
  scopes: string;
  projectIds: string | null;
  draftIds: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}): McpToken {
  return {
    id: token.id,
    name: token.name,
    scopes: Array.from(toScopeSet(token.scopes)),
    projectIds: parseStringList(token.projectIds),
    draftIds: parseStringList(token.draftIds),
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
  };
}

export async function createMcpToken(input: CreateMcpTokenInput) {
  const tokenPrefix = randomString(TOKEN_PREFIX_LENGTH);
  const tokenSecret = randomString(TOKEN_SECRET_LENGTH);
  const rawToken = `${TOKEN_FORMAT_PREFIX}_${tokenPrefix}_${tokenSecret}`;
  const tokenHash = hashTokenValue(rawToken);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const created = await db.mcpAccessToken.create({
    data: {
      id: nanoid(),
      ownerId: input.ownerId,
      name: input.name,
      tokenPrefix,
      tokenHash,
      scopes: JSON.stringify(input.scopes),
      projectIds: serializeStringList(input.projectIds),
      draftIds: serializeStringList(input.draftIds),
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      projectIds: true,
      draftIds: true,
      createdAt: true,
      updatedAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  return {
    token: toTokenResponse(created),
    secret: rawToken,
  };
}

export async function listMcpTokens(ownerId: string): Promise<McpToken[]> {
  const tokens = await db.mcpAccessToken.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      scopes: true,
      projectIds: true,
      draftIds: true,
      createdAt: true,
      updatedAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  return tokens.map(toTokenResponse);
}

export async function revokeMcpToken(id: string, ownerId: string) {
  const result = await db.mcpAccessToken.updateMany({
    where: {
      id,
      ownerId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

export async function authenticateMcpToken(rawToken: string): Promise<McpTokenAuthContext | null> {
  const parsed = parseRawToken(rawToken);
  if (!parsed) return null;

  const token = await db.mcpAccessToken.findUnique({
    where: { tokenPrefix: parsed.tokenPrefix },
    select: {
      id: true,
      ownerId: true,
      tokenHash: true,
      scopes: true,
      projectIds: true,
      draftIds: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!token || token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

  const expected = Buffer.from(token.tokenHash, 'utf8');
  const actualHash = hashTokenValue(rawToken);
  const actual = Buffer.from(actualHash, 'utf8');
  const hashMatches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!hashMatches) return null;

  return {
    tokenId: token.id,
    ownerId: token.ownerId,
    scopes: toScopeSet(token.scopes),
    projectIds: token.projectIds ? new Set(parseStringList(token.projectIds) ?? []) : null,
    draftIds: token.draftIds ? new Set(parseStringList(token.draftIds) ?? []) : null,
  };
}

export function hasMcpScope(auth: McpTokenAuthContext, scope: McpTokenScope) {
  return auth.scopes.has(scope);
}

export async function touchMcpToken(tokenId: string) {
  await db.mcpAccessToken.update({
    where: { id: tokenId },
    data: { lastUsedAt: new Date() },
  });
}
