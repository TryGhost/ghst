import { ExitCode, GhstError } from './errors.js';
import type { GlobalOptions } from './types.js';

export function assertDestructiveActionsEnabled(
  global: GlobalOptions,
  action = 'this operation',
): void {
  if (global.enableDestructiveActions) {
    return;
  }

  throw new GhstError(
    `Destructive actions are disabled for ${action}. Re-run with --enable-destructive-actions to continue.`,
    {
      code: 'DESTRUCTIVE_ACTIONS_DISABLED',
      exitCode: ExitCode.USAGE_ERROR,
    },
  );
}

export function isDestructiveHttpMethod(method: string | undefined): boolean {
  const normalized = (method ?? 'GET').toUpperCase();
  return normalized === 'DELETE';
}
