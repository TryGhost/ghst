import { GhostApiError, GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
  });
}

export async function listUsers(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.users.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('users', (page) => client.users.browse({ ...params, page, limit }));
}

export async function getUser(
  global: GlobalOptions,
  options: {
    id?: string;
    slug?: string;
    email?: string;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);

  if (options.id) {
    return client.users.read(options.id, {
      params: options.params,
    });
  }

  if (options.slug) {
    return client.users.read(options.slug, {
      bySlug: true,
      params: options.params,
    });
  }

  if (options.email) {
    return client.users.read(options.email, {
      byEmail: true,
      params: options.params,
    });
  }

  throw new GhstError('Provide an id argument, --slug, or --email.', {
    code: 'USAGE_ERROR',
    exitCode: ExitCode.USAGE_ERROR,
  });
}

export async function getCurrentUser(
  global: GlobalOptions,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  try {
    return await client.users.me(params);
  } catch (error) {
    if (error instanceof GhostApiError && (error.status === 403 || error.status === 404)) {
      throw new GhstError(
        'Current user is unavailable for this token. Use a staff/session token with user context.',
        {
          code: 'AUTH_ERROR',
          exitCode: ExitCode.AUTH_ERROR,
          status: error.status,
          details: error.payload,
        },
      );
    }

    throw error;
  }
}
