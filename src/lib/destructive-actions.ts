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

function isReadOnlyHttpMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

// Resources whose non-read writes overwrite or replace existing content
// wholesale (e.g. `POST /db/` imports a full content archive). These are
// destructive regardless of the HTTP verb, unlike ordinary create/update
// writes which are allowed without the destructive flag.
const DESTRUCTIVE_WRITE_RESOURCES = new Set(['db']);

function getResourceSegment(path: string | undefined): string | null {
  if (!path) {
    return null;
  }
  const [segment] = path.split('/').filter(Boolean);
  return segment ? segment.toLowerCase() : null;
}

// Classifies whether a raw Ghost API request needs the destructive-actions
// guard. `DELETE` is always destructive; other writes are gated only when they
// target an overwrite/import route. Plain `POST`/`PUT`/`PATCH` creates and
// updates are allowed by default.
export function isDestructiveRawRequest(options: {
  method: string | undefined;
  path: string | undefined;
}): boolean {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method === 'DELETE') {
    return true;
  }
  if (isReadOnlyHttpMethod(method)) {
    return false;
  }

  const resource = getResourceSegment(options.path);
  return resource !== null && DESTRUCTIVE_WRITE_RESOURCES.has(resource);
}
