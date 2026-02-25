import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

function getFirstPage(payload: Record<string, unknown>): Record<string, unknown> {
  const pages = payload.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new GhstError('Page not found', {
      exitCode: ExitCode.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  }

  return (pages[0] as Record<string, unknown>) ?? {};
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
  });
}

export async function listPages(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.pages.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('pages', (page) => client.pages.browse({ ...params, page, limit }));
}

export async function getPage(
  global: GlobalOptions,
  idOrSlug: string,
  options: {
    bySlug?: boolean;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.pages.read(idOrSlug, options);
}

export async function createPage(
  global: GlobalOptions,
  page: Record<string, unknown>,
  source?: 'html',
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.pages.add(page, source);
}

export async function updatePage(
  global: GlobalOptions,
  options: {
    id?: string;
    slug?: string;
    patch: Record<string, unknown>;
    source?: 'html';
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
  const existingPayload = await client.pages.read(lookup, { bySlug });
  const existing = getFirstPage(existingPayload);

  const id = String(existing.id ?? '');
  const updatedAt = existing.updated_at;

  if (!id || typeof updatedAt !== 'string') {
    throw new GhstError('Page is missing required id/updated_at for update.', {
      code: 'CONFLICT',
      exitCode: ExitCode.CONFLICT,
    });
  }

  return client.pages.edit(
    id,
    {
      ...options.patch,
      updated_at: updatedAt,
    },
    options.source,
  );
}

export async function deletePage(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, never>> {
  const client = await getClient(global);
  return client.pages.delete(id);
}

export async function copyPage(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.pages.copy(id);
}

function extractPageIds(payload: GhostPaginatedResponse): string[] {
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  return pages
    .map((entry) => String((entry as Record<string, unknown>)?.id ?? '').trim())
    .filter(Boolean);
}

export async function bulkPages(
  global: GlobalOptions,
  options: {
    filter: string;
    delete?: boolean;
    status?: 'draft' | 'published' | 'scheduled';
  },
): Promise<Record<string, unknown>> {
  const list = await listPages(
    global,
    {
      filter: options.filter,
      limit: 100,
    },
    true,
  );
  const ids = extractPageIds(list);

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
        await deletePage(global, id);
      } else {
        await updatePage(global, {
          id,
          patch: {
            status: options.status,
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
