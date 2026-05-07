import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';

export function getGlobalOptions(command: Command): GlobalOptions {
  const options = command.optsWithGlobals() as GlobalOptions;
  const noColorFromEnv = process.env.NO_COLOR === '1' || process.env.GHST_NO_COLOR === '1';

  return {
    json: options.json,
    jq: options.jq,
    site: options.site,
    url: options.url,
    staffToken: options.staffToken,
    enableDestructiveActions: options.enableDestructiveActions,
    debug: options.debug,
    color: options.color !== false && !noColorFromEnv,
  };
}
