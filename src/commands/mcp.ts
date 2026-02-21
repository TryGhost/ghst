import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { parseCsv, parseInteger } from '../lib/parse.js';
import { createGhostMcpServer } from '../mcp/server.js';
import { MCP_TOOL_GROUPS, parseToolGroups } from '../mcp/tools/core.js';
import { runMcpHttp } from '../mcp/transports/http.js';
import { runMcpStdio } from '../mcp/transports/stdio.js';

let runMcpStdioForTests:
  | ((server: ReturnType<typeof createGhostMcpServer>) => Promise<void>)
  | null = null;
let runMcpHttpForTests:
  | ((
      server: ReturnType<typeof createGhostMcpServer>,
      options: { host: string; port: number; corsOrigin?: string },
    ) => Promise<void>)
  | null = null;

export function setMcpRunnersForTests(
  options: {
    stdio?: ((server: ReturnType<typeof createGhostMcpServer>) => Promise<void>) | null;
    http?:
      | ((
          server: ReturnType<typeof createGhostMcpServer>,
          options: { host: string; port: number; corsOrigin?: string },
        ) => Promise<void>)
      | null;
  } | null,
): void {
  runMcpStdioForTests = options?.stdio ?? null;
  runMcpHttpForTests = options?.http ?? null;
}

function assertToolsFilter(toolsArg: string | undefined): void {
  if (!toolsArg || toolsArg === 'all') {
    return;
  }

  const requested = parseCsv(toolsArg) ?? [];
  const allowed = new Set(MCP_TOOL_GROUPS);
  const invalid = requested.filter(
    (value) => !allowed.has(value as (typeof MCP_TOOL_GROUPS)[number]),
  );
  if (invalid.length > 0) {
    throw new GhstError(`Unknown MCP tool group(s): ${invalid.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }
}

export function registerMcpCommands(program: Command): void {
  const mcp = program.command('mcp').description('MCP server mode');

  mcp
    .command('stdio')
    .description('Run MCP server over stdio transport')
    .option(
      '--tools <tools>',
      `Tool groups to expose (comma-separated or all). Available: ${MCP_TOOL_GROUPS.join(', ')}`,
      'all',
    )
    .action(async (options, command) => {
      assertToolsFilter(options.tools);
      const global = getGlobalOptions(command);
      const enabledGroups = parseToolGroups(options.tools);
      const server = createGhostMcpServer(global, { enabledGroups });
      const run = runMcpStdioForTests ?? runMcpStdio;
      await run(server);
    });

  mcp
    .command('http')
    .description('Run MCP server over HTTP transport')
    .option('--host <host>', 'Bind host', '127.0.0.1')
    .option('--port <port>', 'Bind port', '3100')
    .option('--cors-origin <origin>', 'Allow CORS origin')
    .option(
      '--tools <tools>',
      `Tool groups to expose (comma-separated or all). Available: ${MCP_TOOL_GROUPS.join(', ')}`,
      'all',
    )
    .action(async (options, command) => {
      assertToolsFilter(options.tools);
      const port = parseInteger(options.port, 'port');
      if (!port) {
        throw new GhstError('port is required', {
          code: 'USAGE_ERROR',
          exitCode: ExitCode.USAGE_ERROR,
        });
      }

      const global = getGlobalOptions(command);
      const enabledGroups = parseToolGroups(options.tools);
      const server = createGhostMcpServer(global, { enabledGroups });
      const run = runMcpHttpForTests ?? runMcpHttp;

      await run(server, {
        host: options.host,
        port,
        corsOrigin: options.corsOrigin,
      });
    });
}
