import type { Command } from 'commander';
import { ExitCode, GhstError } from '../lib/errors.js';

export function registerNotImplemented(
  parent: Command,
  name: string,
  description: string,
  actionLabel: string,
): void {
  parent
    .command(name)
    .description(description)
    .action(() => {
      throw new GhstError(`${actionLabel} is not implemented yet in the Phase 1 skeleton`, {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'NOT_IMPLEMENTED',
      });
    });
}
