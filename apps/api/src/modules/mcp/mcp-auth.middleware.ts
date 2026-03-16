import type { Context, Next } from 'hono';
import { UnauthorizedError } from '../../common/errors';
import type { McpTokenScope } from '@draftila/shared';
import { checkRateLimit } from '../../common/middleware/rate-limit';
import {
  authenticateMcpToken,
  hasMcpScope,
  type McpTokenAuthContext,
  touchMcpToken,
} from './mcp-token.service';

export type McpAuthEnv = {
  Variables: {
    mcpAuth: McpTokenAuthContext;
  };
};

function parseBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

function parseMcpToken(c: Context<McpAuthEnv>) {
  const authorizationHeader =
    c.req.header('authorization') ??
    c.req.header('Authorization') ??
    c.req.raw.headers.get('authorization') ??
    undefined;
  const bearerToken = parseBearerToken(authorizationHeader);
  if (bearerToken) return bearerToken;

  const directToken = c.req.header('x-mcp-token') ?? c.req.raw.headers.get('x-mcp-token');
  if (directToken) return directToken;
  return null;
}

export function requireMcpAuth(requiredScopes: McpTokenScope[] = []) {
  return async (c: Context<McpAuthEnv>, next: Next) => {
    const blocked = checkRateLimit(c, 'mcp-auth', { windowMs: 60_000, max: 120 });
    if (blocked) return blocked;

    const rawToken = parseMcpToken(c);
    if (!rawToken) {
      throw new UnauthorizedError();
    }

    const auth = await authenticateMcpToken(rawToken);
    if (!auth) {
      throw new UnauthorizedError();
    }

    for (const scope of requiredScopes) {
      if (!hasMcpScope(auth, scope)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    c.set('mcpAuth', auth);
    await touchMcpToken(auth.tokenId);
    await next();
  };
}
