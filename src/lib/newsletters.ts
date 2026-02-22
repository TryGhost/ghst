import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function listNewsletters(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.newsletters.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('newsletters', (page) =>
    client.newsletters.browse({ ...params, page, limit }),
  );
}

export async function getNewsletter(
  global: GlobalOptions,
  id: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.newsletters.read(id, params);
}

export async function createNewsletter(
  global: GlobalOptions,
  newsletter: Record<string, unknown>,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.newsletters.add(newsletter, params);
}

export async function updateNewsletter(
  global: GlobalOptions,
  id: string,
  patch: Record<string, unknown>,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.newsletters.edit(id, patch, params);
}

export async function bulkNewsletters(
  global: GlobalOptions,
  options: {
    filter: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const list = await listNewsletters(
    global,
    {
      filter: options.filter,
      limit: 100,
    },
    true,
  );
  const newsletters = Array.isArray(list.newsletters) ? list.newsletters : [];
  const ids = newsletters
    .map((entry) => String((entry as Record<string, unknown>)?.id ?? '').trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return {
      bulk: {
        meta: {
          stats: {
            successful: 0,
            unsuccessful: 0,
          },
        },
        errors: [],
      },
    };
  }

  let successful = 0;
  let unsuccessful = 0;
  const errors: Array<Record<string, string>> = [];

  for (const id of ids) {
    try {
      await updateNewsletter(global, id, options.patch);
      successful += 1;
    } catch (error) {
      unsuccessful += 1;
      errors.push({
        id,
        message: (error as Error).message,
      });
    }
  }

  return {
    bulk: {
      meta: {
        stats: {
          successful,
          unsuccessful,
        },
      },
      errors,
    },
  };
}
