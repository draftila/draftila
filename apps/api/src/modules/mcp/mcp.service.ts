import type { McpTokenAuthContext } from './mcp-token.service';
import { McpForbiddenError, McpUnknownToolError, McpInvalidToolCallError } from './mcp-errors';
import { MCP_TOOLS, toolsByName, type ToolResult } from './mcp-tools';

const protocolVersion = '2025-06-18';

export function createInitializeResult() {
  return {
    protocolVersion,
    serverInfo: {
      name: 'draftila-mcp',
      version: '0.1.0',
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
  };
}

export function listTools() {
  return {
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
}

function formatTextResult(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}

function formatImageResult(base64: string, mimeType: string) {
  return {
    content: [{ type: 'image', data: base64, mimeType }],
    isError: false,
  };
}

function formatResult(result: ToolResult) {
  if (result.kind === 'image') {
    return formatImageResult(result.base64, result.mimeType);
  }
  return formatTextResult(result.value);
}

export async function callTool(
  auth: McpTokenAuthContext,
  params: { name?: string; arguments?: unknown },
) {
  const toolName = params.name;
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  if (!toolName) {
    throw new McpInvalidToolCallError();
  }

  const toolDef = toolsByName.get(toolName);
  if (!toolDef) {
    throw new McpUnknownToolError();
  }

  if (!auth.scopes.has(toolDef.requiredScope)) {
    throw new McpForbiddenError();
  }

  const result = await toolDef.handler(auth, args);
  return formatResult(result);
}
