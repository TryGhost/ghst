import type { Command } from 'commander';
import { getUserConfigPath, readUserConfig } from '../lib/config.js';
import { getGlobalOptions } from '../lib/context.js';

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('CLI configuration');

  config
    .command('show')
    .description('Show current user config')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const userConfig = await readUserConfig();

      if (global.json) {
        console.log(JSON.stringify(userConfig, null, 2));
        return;
      }

      console.log(`Path: ${getUserConfigPath()}`);
      console.log(`Active: ${userConfig.active ?? '(none)'}`);
      console.log(`Sites: ${Object.keys(userConfig.sites).join(', ') || '(none)'}`);
    });
}
