import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
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

export async function listOffers(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.offers.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('offers', (page) => client.offers.browse({ ...params, page, limit }));
}

export async function getOffer(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.offers.read(id);
}

export async function createOffer(
  global: GlobalOptions,
  offer: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.offers.add(offer);
}

export async function updateOffer(
  global: GlobalOptions,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.offers.edit(id, patch);
}

export async function bulkOffers(
  global: GlobalOptions,
  options: {
    filter: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const list = await listOffers(
    global,
    {
      filter: options.filter,
      limit: 100,
    },
    true,
  );
  const offers = Array.isArray(list.offers) ? list.offers : [];
  const ids = offers
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
      await updateOffer(global, id, options.patch);
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
