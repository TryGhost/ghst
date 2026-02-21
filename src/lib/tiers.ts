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
