import { Hono } from 'hono';
import { createMcpTokenSchema } from '@draftila/shared';
import { ValidationError } from '../../common/errors';
import { requireAuth, type AuthEnv } from '../../common/middleware/auth';
import { createMcpToken, listMcpTokens, revokeMcpToken } from './mcp-token.service';

const mcpManagementRoutes = new Hono<AuthEnv>();

mcpManagementRoutes.use(requireAuth);

mcpManagementRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tokens = await listMcpTokens(user.id);
  return c.json({ data: tokens });
});

mcpManagementRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createMcpTokenSchema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    throw new ValidationError(flattened.fieldErrors as Record<string, string[]>);
  }

  const created = await createMcpToken({
    ownerId: user.id,
    name: parsed.data.name,
    scopes: parsed.data.scopes,
    projectIds: parsed.data.projectIds,
    draftIds: parsed.data.draftIds,
    expiresInDays: parsed.data.expiresInDays,
  });

  return c.json(created, 201);
});

mcpManagementRoutes.post('/:id/revoke', async (c) => {
  const user = c.get('user');
  const revoked = await revokeMcpToken(c.req.param('id'), user.id);
  if (!revoked) {
    return c.json({ ok: false }, 404);
  }
  return c.json({ ok: true });
});

export { mcpManagementRoutes };
