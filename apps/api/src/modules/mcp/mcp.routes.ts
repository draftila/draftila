import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveApiKeyUser } from './mcp.auth';
import { createMcpServer } from './mcp.server';

const mcpRoutes = new Hono();

function ensureAcceptHeader(req: Request): Request {
  const accept = req.headers.get('accept') ?? '';
  const needs = [];
  if (!accept.includes('application/json')) needs.push('application/json');
  if (!accept.includes('text/event-stream')) needs.push('text/event-stream');
  if (needs.length === 0) return req;

  const headers = new Headers(req.headers);
  headers.set('accept', [accept, ...needs].filter(Boolean).join(', '));
  return new Request(req.url, {
    method: req.method,
    headers,
    body: req.body,
    duplex: 'half',
  });
}

mcpRoutes.all('/', async (c) => {
  const raw = ensureAcceptHeader(c.req.raw);

  if (c.req.method === 'DELETE') {
    return c.json({ ok: true });
  }

  const user = await resolveApiKeyUser(raw.headers);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer(() => user.userId);
  await server.connect(transport);

  const response = await transport.handleRequest(raw);

  transport.onclose = () => {
    server.close().catch(() => {});
  };

  return response;
});

export { mcpRoutes };
