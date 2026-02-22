import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

function getFirstLabel(payload: Record<string, unknown>): Record<string, unknown> {
  const labels = payload.labels;
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new GhstError('Label not found', {
      exitCode: ExitCode.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  }

  return (labels[0] as Record<string, unknown>) ?? {};
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function listLabels(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.labels.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('labels', (page) => client.labels.browse({ ...params, page, limit }));
}

export async function getLabel(
  global: GlobalOptions,
  idOrSlug: string,
  options: {
    bySlug?: boolean;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.labels.read(idOrSlug, options);
}

export async function createLabel(
  global: GlobalOptions,
  label: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.labels.add(label);
}

export async function updateLabel(
  global: GlobalOptions,
  options: {
    id?: string;
    slug?: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);

  let id = options.id;
  if (!id && options.slug) {
    const payload = await client.labels.read(options.slug, { bySlug: true });
    const label = getFirstLabel(payload);
    id = String(label.id ?? '');
  }

  if (!id) {
    throw new GhstError('Provide an id argument or --slug.', {
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  }

  return client.labels.edit(id, options.patch);
}

export async function deleteLabel(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, never>> {
  const client = await getClient(global);
  return client.labels.delete(id);
}

function extractLabelIds(payload: GhostPaginatedResponse): string[] {
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  return labels
    .map((entry) => String((entry as Record<string, unknown>)?.id ?? '').trim())
    .filter(Boolean);
}

export async function bulkLabels(
  global: GlobalOptions,
  options: {
    filter: string;
    delete?: boolean;
    name?: string;
  },
): Promise<Record<string, unknown>> {
  const list = await listLabels(
    global,
    {
      filter: options.filter,
      limit: 100,
    },
    true,
  );
  const ids = extractLabelIds(list);

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
        await deleteLabel(global, id);
      } else {
        await updateLabel(global, {
          id,
          patch: {
            name: options.name,
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
