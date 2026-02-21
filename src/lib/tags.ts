import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

function getFirstTag(payload: Record<string, unknown>): Record<string, unknown> {
  const tags = payload.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new GhstError('Tag not found', {
      exitCode: ExitCode.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  }

  return (tags[0] as Record<string, unknown>) ?? {};
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function listTags(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.tags.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('tags', (page) => client.tags.browse({ ...params, page, limit }));
}

export async function getTag(
  global: GlobalOptions,
  idOrSlug: string,
  options: {
    bySlug?: boolean;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.tags.read(idOrSlug, options);
}

export async function createTag(
  global: GlobalOptions,
  tag: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.tags.add(tag);
}

export async function updateTag(
  global: GlobalOptions,
  options: {
    id?: string;
    slug?: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  const lookup = options.slug ?? options.id;

  if (!lookup) {
    throw new GhstError('Provide an id or --slug.', {
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  }

  const bySlug = Boolean(options.slug);
  const existingPayload = await client.tags.read(lookup, { bySlug });
  const existing = getFirstTag(existingPayload);

  const id = String(existing.id ?? '');
  const updatedAt = existing.updated_at;

  if (!id || typeof updatedAt !== 'string') {
    throw new GhstError('Tag is missing required id/updated_at for update.', {
      code: 'CONFLICT',
      exitCode: ExitCode.CONFLICT,
    });
  }

  return client.tags.edit(id, {
    ...options.patch,
    updated_at: updatedAt,
  });
}

export async function deleteTag(global: GlobalOptions, id: string): Promise<Record<string, never>> {
  const client = await getClient(global);
  return client.tags.delete(id);
}

function extractTagIds(payload: GhostPaginatedResponse): string[] {
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  return tags
    .map((entry) => String((entry as Record<string, unknown>)?.id ?? '').trim())
    .filter(Boolean);
}

export async function bulkTags(
  global: GlobalOptions,
  options: {
    filter: string;
    delete?: boolean;
    visibility?: 'public' | 'internal';
  },
): Promise<Record<string, unknown>> {
  const list = await listTags(
    global,
    {
      filter: options.filter,
      limit: 100,
    },
    true,
  );
  const ids = extractTagIds(list);

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
      if (options.delete) {
        await deleteTag(global, id);
      } else {
        await updateTag(global, {
          id,
          patch: {
            visibility: options.visibility,
          },
        });
      }
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
