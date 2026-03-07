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
      options: {
        host: string;
        port: number;
        corsOrigin?: string;
        authToken: string;
        maxBodyBytes: number;
        headersTimeoutMs: number;
        requestTimeoutMs: number;
        keepAliveTimeoutMs: number;
      },
    ) => Promise<void>)
  | null = null;

export function setMcpRunnersForTests(
  options: {
    stdio?: ((server: ReturnType<typeof createGhostMcpServer>) => Promise<void>) | null;
    http?:
      | ((
          server: ReturnType<typeof createGhostMcpServer>,
          options: {
            host: string;
            port: number;
            corsOrigin?: string;
            authToken: string;
            maxBodyBytes: number;
            headersTimeoutMs: number;
            requestTimeoutMs: number;
            keepAliveTimeoutMs: number;
          },
        ) => Promise<void>)
      | null;
  } | null,
): void {
  runMcpStdioForTests = options?.stdio ?? null;
  runMcpHttpForTests = options?.http ?? null;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === 'localhost'
  );
}

function assertSafeBindHost(host: string, allowPublicBind: boolean): void {
  if (allowPublicBind || isLoopbackHost(host)) {
    return;
  }

  throw new GhstError(
    `mcp http refuses non-loopback host '${host}' without --unsafe-public-bind.`,
    {
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    },
  );
}

function normalizeCorsOrigin(origin: string | undefined): string | undefined {
  if (origin === undefined) {
    return undefined;
  }

  const trimmed = origin.trim();
  if (!trimmed) {
    throw new GhstError('cors-origin must be a single exact origin.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  if (trimmed === '*' || trimmed.includes(',')) {
    throw new GhstError('cors-origin must be a single exact origin and cannot use wildcards.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GhstError('cors-origin must be a valid origin like https://app.example.com.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new GhstError('cors-origin must be a single exact origin without path, query, or hash.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  return parsed.origin;
}

function assertToolsFilter(toolsArg: string | undefined): void {
  if (toolsArg === undefined || toolsArg === 'all') {
    return;
  }

  if (toolsArg.trim().length === 0) {
    throw new GhstError('MCP tool groups cannot be empty.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const requested = parseCsv(toolsArg) ?? [];
  if (requested.length === 0) {
    throw new GhstError('MCP tool groups cannot be empty.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }
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

function parsePositiveIntegerOption(value: string | undefined, label: string): number {
  const parsed = parseInteger(value, label);
  if (parsed === undefined || parsed <= 0) {
    throw new GhstError(`${label} must be a positive integer`, {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  return parsed;
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
    .option('--cors-origin <origin>', 'Allow a single exact CORS origin')
    .option('--unsafe-public-bind', 'Allow binding mcp http to a non-loopback host')
    .option('--max-body-bytes <bytes>', 'Maximum HTTP MCP request body size in bytes', '1048576')
    .option('--headers-timeout-ms <ms>', 'HTTP headers timeout in milliseconds', '15000')
    .option('--request-timeout-ms <ms>', 'HTTP request timeout in milliseconds', '15000')
    .option('--keepalive-timeout-ms <ms>', 'HTTP keep-alive timeout in milliseconds', '5000')
    .requiredOption(
      '--tools <tools>',
      `Tool groups to expose (comma-separated or all). Available: ${MCP_TOOL_GROUPS.join(', ')}`,
    )
    .option('--auth-token <token>', 'Bearer auth token for HTTP MCP requests')
    .action(async (options, command) => {
      assertToolsFilter(options.tools);
      const port = parsePositiveIntegerOption(options.port, 'port');
      const maxBodyBytes = parsePositiveIntegerOption(options.maxBodyBytes, 'max-body-bytes');
      const headersTimeoutMs = parsePositiveIntegerOption(
        options.headersTimeoutMs,
        'headers-timeout-ms',
      );
      const requestTimeoutMs = parsePositiveIntegerOption(
        options.requestTimeoutMs,
        'request-timeout-ms',
      );
      const keepAliveTimeoutMs = parsePositiveIntegerOption(
        options.keepaliveTimeoutMs,
        'keepalive-timeout-ms',
      );
      assertSafeBindHost(options.host, Boolean(options.unsafePublicBind));
      const corsOrigin = normalizeCorsOrigin(options.corsOrigin as string | undefined);
      const authToken =
        (options.authToken as string | undefined) ?? process.env.GHST_MCP_AUTH_TOKEN;
      if (!authToken) {
        throw new GhstError('mcp http requires --auth-token or GHST_MCP_AUTH_TOKEN.', {
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
        corsOrigin,
        authToken,
        maxBodyBytes,
        headersTimeoutMs,
        requestTimeoutMs,
        keepAliveTimeoutMs,
      });
    });
}
