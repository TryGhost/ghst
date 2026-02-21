import type { Command } from 'commander';
import type { GlobalOptions } from './types.js';

export function getGlobalOptions(command: Command): GlobalOptions {
  const options = command.optsWithGlobals() as GlobalOptions;
  return {
    json: options.json,
    jq: options.jq,
    site: options.site,
    url: options.url,
    key: options.key,
    debug: options.debug,
    color: options.color,
  };
}
