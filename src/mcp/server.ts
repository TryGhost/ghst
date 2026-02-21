import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GlobalOptions } from '../lib/types.js';
import { type McpToolGroup, registerCoreTools } from './tools/core.js';

export function createGhostMcpServer(
  global: GlobalOptions,
  options: {
    enabledGroups: Set<McpToolGroup>;
  },
): McpServer {
  const server = new McpServer({
    name: 'ghst',
    version: '0.4.0',
  });

  registerCoreTools(server, global, options.enabledGroups);
  return server;
}
