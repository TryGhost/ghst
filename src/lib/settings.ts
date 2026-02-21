import { GhostApiError, GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import type { GlobalOptions } from './types.js';

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function listSettings(global: GlobalOptions): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.settings.browse();
}

export async function getSetting(
  global: GlobalOptions,
  key: string,
): Promise<Record<string, unknown>> {
  const payload = await listSettings(global);
  const settings = Array.isArray(payload.settings)
    ? (payload.settings as Array<Record<string, unknown>>)
    : [];

  const target = settings.find((setting) => String(setting.key ?? '') === key);
  if (!target) {
    throw new GhstError(`Setting not found: ${key}`, {
      exitCode: ExitCode.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  }

  return {
    settings: [target],
  };
}

export async function setSetting(
  global: GlobalOptions,
  key: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  try {
    return await client.settings.edit([{ key, value }]);
  } catch (error) {
    if (error instanceof GhostApiError && error.status === 403) {
      throw new GhstError(
        'Settings update is forbidden for this token. Use a staff/user session with settings permissions.',
        {
          code: 'AUTH_ERROR',
          exitCode: ExitCode.AUTH_ERROR,
          status: 403,
          details: error.payload,
        },
      );
    }

    throw error;
  }
}
