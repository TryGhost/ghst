import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { printJson, printSiteHuman } from '../lib/output.js';
import { getSiteInfo } from '../lib/site.js';

export function registerSiteCommands(program: Command): void {
  const site = program.command('site').description('Site management');

  site
    .command('info')
    .description('Get site information')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await getSiteInfo(global);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printSiteHuman(payload);
    });
}
