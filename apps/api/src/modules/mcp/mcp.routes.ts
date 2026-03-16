import { Hono } from 'hono';
import { requireMcpAuth, type McpAuthEnv } from './mcp-auth.middleware';
import { callTool, createInitializeResult, listTools } from './mcp.service';

const mcpRoutes = new Hono<McpAuthEnv>();

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
    },
  };
}

function jsonRpcResult(id: string | number | null | undefined, result: unknown) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

mcpRoutes.post('/', requireMcpAuth(), async (c) => {
  const body = (await c.req.json()) as JsonRpcRequest;
  const id = body.id;

  if (body.jsonrpc !== '2.0' || !body.method) {
    return c.json(jsonRpcError(id, -32600, 'Invalid Request'), 400);
  }

  if (body.method === 'initialize') {
    return c.json(jsonRpcResult(id, createInitializeResult()));
  }

  if (body.method === 'notifications/initialized') {
    return new Response(null, { status: 202 });
  }

  if (body.method === 'tools/list') {
    return c.json(jsonRpcResult(id, listTools()));
  }

  if (body.method === 'tools/call') {
    try {
      const auth = c.get('mcpAuth');
      const result = await callTool(auth, body.params as { name?: string; arguments?: unknown });
      return c.json(jsonRpcResult(id, result));
    } catch (error) {
      if (error instanceof Error && error.message === 'Forbidden') {
        return c.json(jsonRpcError(id, -32003, 'Forbidden'), 403);
      }
      if (error instanceof Error && error.message === 'Draft not found') {
        return c.json(jsonRpcError(id, -32004, 'Draft not found'), 404);
      }
      if (error instanceof Error && error.message === 'Unknown tool') {
        return c.json(jsonRpcError(id, -32601, 'Method not found'), 404);
      }
      if (error instanceof Error && error.message === 'Invalid tool call') {
        return c.json(jsonRpcError(id, -32602, 'Invalid params'), 400);
      }
      if (error instanceof Error && error.message.startsWith('Invalid tool arguments')) {
        return c.json(jsonRpcError(id, -32602, error.message), 400);
      }
      if (error instanceof Error && error.message === 'No editor connected') {
        return c.json(
          jsonRpcError(
            id,
            -32005,
            'No editor connected. Open the draft in the Draftila editor to use this tool.',
          ),
          409,
        );
      }
      if (error instanceof Error && error.message === 'RPC timeout') {
        return c.json(
          jsonRpcError(id, -32006, 'Editor did not respond in time. Please try again.'),
          504,
        );
      }
      console.error('MCP tool call failed:', error);
      return c.json(jsonRpcError(id, -32000, 'Tool execution failed'), 500);
    }
  }

  return c.json(jsonRpcError(id, -32601, 'Method not found'), 404);
});

export { mcpRoutes };
