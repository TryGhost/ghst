import { GhostApiError, GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

function getFirstPost(payload: Record<string, unknown>): Record<string, unknown> {
  const posts = payload.posts;
  if (!Array.isArray(posts) || posts.length === 0) {
    throw new GhstError('Post not found', {
      exitCode: ExitCode.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  }

  return (posts[0] as Record<string, unknown>) ?? {};
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function listPosts(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.posts.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('posts', (page) => client.posts.browse({ ...params, page, limit }));
}

export async function getPost(
  global: GlobalOptions,
  idOrSlug: string,
  options: {
    bySlug?: boolean;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.posts.read(idOrSlug, options);
}

export async function createPost(
  global: GlobalOptions,
  post: Record<string, unknown>,
  source?: 'html',
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.posts.add(post, source);
}

export async function updatePost(
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

  const applyUpdate = async (): Promise<Record<string, unknown>> => {
    const existingPayload = await client.posts.read(lookup, { bySlug });
    const existing = getFirstPost(existingPayload);
    const id = String(existing.id ?? '');
    const updatedAt = existing.updated_at;

    if (!id || typeof updatedAt !== 'string') {
      throw new GhstError('Post is missing required id/updated_at for update.', {
        code: 'CONFLICT',
        exitCode: ExitCode.CONFLICT,
      });
    }

    return client.posts.edit(
      id,
      {
        ...options.patch,
        updated_at: updatedAt,
      },
      options.source,
    );
  };

  try {
    return await applyUpdate();
  } catch (error) {
    if (error instanceof GhostApiError && error.status === 409) {
      return applyUpdate();
    }

    throw error;
  }
}

export async function deletePost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, never>> {
  const client = await getClient(global);
  return client.posts.delete(id);
}

export async function publishPost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  return updatePost(global, {
    id,
    patch: {
      status: 'published',
    },
  });
}
