import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { GhostClient } from '../lib/client.js';
import { resolveConnectionConfig } from '../lib/config.js';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';
import { parseQueryPairs } from '../lib/parse.js';

export function registerApiCommands(program: Command): void {
  program
    .command('api [endpointPath]')
    .description('Make a raw Ghost API request')
    .option('-X, --method <method>', 'HTTP method', 'GET')
    .option('--body <json>', 'Inline JSON request body')
    .option('--input <path>', 'Read JSON request body from file')
    .option('--query <pairs...>', 'Query params in key=value format')
    .option('--content-api', 'Use Content API instead of Admin API')
    .action(async (endpointPath: string | undefined, options, command) => {
      if (!endpointPath) {
        throw new GhstError('Missing required argument: endpointPath', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      if (options.body && options.input) {
        throw new GhstError('Use either --body or --input, not both.', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const global = getGlobalOptions(command);
      const connection = await resolveConnectionConfig(global);
      const client = new GhostClient({
        url: connection.url,
        key: connection.key,
        contentKey: process.env.GHOST_CONTENT_API_KEY,
        version: connection.apiVersion,
      });

      const params = parseQueryPairs(options.query);
      const body = options.input
        ? (JSON.parse(await fs.readFile(options.input, 'utf8')) as unknown)
        : options.body
          ? (JSON.parse(options.body) as unknown)
          : undefined;

      const data = await client.rawRequest(endpointPath, options.method, body, params, {
        api: options.contentApi ? 'content' : 'admin',
      });
      printJson(data, global.jq);
    });
}
