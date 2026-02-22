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
  options?: {
    newsletter?: string;
    email_only?: boolean;
    email_segment?: string;
  },
): Promise<Record<string, unknown>> {
  return updatePost(global, {
    id,
    patch: {
      status: 'published',
      newsletter: options?.newsletter,
      email_only: options?.email_only,
      email_segment: options?.email_segment,
    },
  });
}

export async function schedulePost(
  global: GlobalOptions,
  id: string,
  at: string,
): Promise<Record<string, unknown>> {
  return updatePost(global, {
    id,
    patch: {
      status: 'scheduled',
      published_at: at,
    },
  });
}

export async function unschedulePost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  return updatePost(global, {
    id,
    patch: {
      status: 'draft',
      published_at: null,
    },
  });
}

export async function copyPost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.posts.copy(id);
}

function extractPostIds(payload: GhostPaginatedResponse): string[] {
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  return posts
    .map((entry) => String((entry as Record<string, unknown>)?.id ?? '').trim())
    .filter(Boolean);
}

function extractPostEntries(payload: GhostPaginatedResponse): Array<Record<string, unknown>> {
  return Array.isArray(payload.posts)
    ? payload.posts.map((entry) => (entry as Record<string, unknown>) ?? {})
    : [];
}

export async function bulkPosts(
  global: GlobalOptions,
  options: {
    filter: string;
    delete?: boolean;
    status?: 'draft' | 'published' | 'scheduled';
    tags?: string[];
    addTags?: string[];
    authors?: string[];
  },
): Promise<Record<string, unknown>> {
  const list = await listPosts(
    global,
    {
      filter: options.filter,
      limit: 100,
      include: 'tags,authors',
    },
    true,
  );
  const ids = extractPostIds(list);
  const posts = extractPostEntries(list);
  const postsById = new Map<string, Record<string, unknown>>(
    posts.map((post) => [String(post.id ?? ''), post]),
  );

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
        await deletePost(global, id);
      } else {
        const current = postsById.get(id) ?? {};
        const existingTagNames = Array.isArray(current.tags)
          ? current.tags
              .map((tag) => String((tag as Record<string, unknown>)?.name ?? '').trim())
              .filter(Boolean)
          : [];

        let mergedTags: string[] | undefined;
        if (options.addTags && options.addTags.length > 0) {
          const base = options.tags && options.tags.length > 0 ? options.tags : existingTagNames;
          mergedTags = Array.from(new Set([...base, ...options.addTags]));
        }

        await updatePost(global, {
          id,
          patch: {
            status: options.status,
            tags: mergedTags ?? options.tags,
            authors: options.authors,
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
