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
  const dataUrl = `data:${mimeType};base64,${base64}`;
  return {
    content: [{ type: 'image', data: base64, mimeType }],
    structuredContent: {
      image: {
        data: base64,
        mimeType,
        dataUrl,
      },
    },
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
  if (!toolName) {
    throw new McpInvalidToolCallError();
  }

  const rawArgs = params.arguments;
  if (
    rawArgs !== undefined &&
    (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs))
  ) {
    throw new McpInvalidToolCallError();
  }
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const toolDef = toolsByName.get(toolName);
  if (!toolDef) {
    throw new McpUnknownToolError();
  }

  if (!auth.scopes.has(toolDef.requiredScope)) {
    throw new McpForbiddenError();
  }

  try {
    const result = await toolDef.handler(auth, args);
    return formatResult(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid tool arguments') {
      throw new McpInvalidToolCallError();
    }
    throw error;
  }
}
