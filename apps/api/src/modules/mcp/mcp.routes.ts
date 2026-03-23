import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { nanoid } from '../../common/lib/utils';
import { resolveApiKeyUser } from './mcp.auth';
import { createMcpServer } from './mcp.server';

interface SessionEntry {
  transport: WebStandardStreamableHTTPServerTransport;
  userId: string;
}

const sessions = new Map<string, SessionEntry>();

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
  const sessionId = c.req.header('mcp-session-id');
  const raw = ensureAcceptHeader(c.req.raw);

  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    return entry.transport.handleRequest(raw);
  }

  if (sessionId && !sessions.has(sessionId)) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found. Please reconnect.' },
        id: null,
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  if (c.req.method === 'DELETE') {
    return c.json({ ok: true });
  }

  const user = await resolveApiKeyUser(raw.headers);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => nanoid(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, userId: user.userId });
    },
    onsessionclosed: (sid) => {
      sessions.delete(sid);
    },
    enableJsonResponse: true,
  });

  const server = createMcpServer(() => {
    const sid = transport.sessionId;
    if (sid) {
      const entry = sessions.get(sid);
      if (entry) return entry.userId;
    }
    return user.userId;
  });

  await server.connect(transport);

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  return transport.handleRequest(raw);
});

export { mcpRoutes };
