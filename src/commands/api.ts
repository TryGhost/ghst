import type { Command } from 'commander';
import { GhostClient } from '../lib/client.js';
import { resolveConnectionConfig } from '../lib/config.js';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';

export function registerApiCommands(program: Command): void {
  program
    .command('api [endpointPath]')
    .description('Make a raw Ghost Admin API request')
    .option('--method <method>', 'HTTP method', 'GET')
    .option('--body <json>', 'JSON request body')
    .option('--query <pairs...>', 'Query params in key=value format')
    .action(async (endpointPath: string | undefined, options, command) => {
      if (!endpointPath) {
        throw new GhstError('Missing required argument: endpointPath', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const global = getGlobalOptions(command);
      const connection = await resolveConnectionConfig(global);
      const client = new GhostClient({
        url: connection.url,
        key: connection.key,
        version: connection.apiVersion,
      });

      const params = Object.fromEntries(
        (options.query ?? []).map((entry: string) => {
          const [key, ...rest] = entry.split('=');
          return [key, rest.join('=')];
        }),
      );

      const body = options.body ? (JSON.parse(options.body) as unknown) : undefined;
      const data = await client.rawRequest(endpointPath, options.method, body, params);
      printJson(data, global.jq);
    });
}
