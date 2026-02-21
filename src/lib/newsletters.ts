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
