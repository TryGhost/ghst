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

export async function listTiers(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.tiers.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('tiers', (page) => client.tiers.browse({ ...params, page, limit }));
}

export async function getTier(
  global: GlobalOptions,
  id: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.tiers.read(id, params);
}

export async function createTier(
  global: GlobalOptions,
  tier: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.tiers.add(tier);
}

export async function updateTier(
  global: GlobalOptions,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.tiers.edit(id, patch);
}

export async function bulkTiers(
  global: GlobalOptions,
  options: {
    filter: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const list = await listTiers(
    global,
    {
      filter: options.filter,
      limit: 100,
    },
    true,
  );
  const tiers = Array.isArray(list.tiers) ? list.tiers : [];
  const ids = tiers
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
      await updateTier(global, id, options.patch);
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
