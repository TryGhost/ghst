import type { Command } from 'commander';

export function registerCompletionCommands(program: Command): void {
  program
    .command('completion')
    .description('Print completion setup guidance')
    .action(() => {
      console.log('Shell completion scaffolding is planned for a later Phase 1 increment.');
      console.log('For now: use `ghst --help` and `ghst <resource> --help` to discover commands.');
    });
}
