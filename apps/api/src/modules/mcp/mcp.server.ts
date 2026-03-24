import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerShapeTools } from './tools/shape-tools';
import { registerPageTools } from './tools/page-tools';
import { registerLayoutTools } from './tools/layout-tools';
import { registerTransformTools } from './tools/transform-tools';
import { registerComponentTools } from './tools/component-tools';
import { registerExportTools } from './tools/export-tools';
import { registerGuideTools } from './tools/guide-tools';
import { registerDraftTools } from './tools/draft-tools';
import { registerBatchTools } from './tools/batch-tools';
import { registerVariableTools } from './tools/variable-tools';
import { registerIconTools } from './tools/icon-tools';

export function createMcpServer(getUserId: () => string): McpServer {
  const server = new McpServer({
    name: 'draftila',
    version: '0.1.0',
  });

  registerDraftTools(server, getUserId);
  registerShapeTools(server, getUserId);
  registerBatchTools(server, getUserId);
  registerPageTools(server, getUserId);
  registerLayoutTools(server, getUserId);
  registerTransformTools(server, getUserId);
  registerComponentTools(server, getUserId);
  registerExportTools(server, getUserId);
  registerGuideTools(server, getUserId);
  registerVariableTools(server, getUserId);
  registerIconTools(server, getUserId);

  return server;
}
