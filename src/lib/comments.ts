import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

export type CommentStatus = 'published' | 'hidden' | 'deleted';

interface CommentBrowseOptions {
  limit?: number;
  page?: number;
  filter?: string;
  order?: string;
  includeNested?: boolean;
}

interface CommentRepliesOptions {
  limit?: number;
  page?: number;
  filter?: string;
}

interface CommentRelationOptions {
  limit?: number;
  page?: number;
}

export interface CommentThreadPayload extends Record<string, unknown> {
  comment: Record<string, unknown> | null;
  comments: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
  });
}

function withDefaultLimit<T extends { limit?: number }>(params: T): T & { limit: number } {
  return {
    ...params,
    limit: params.limit ?? 100,
  };
}

export async function listComments(
  global: GlobalOptions,
  options: CommentBrowseOptions,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);
  const params = withDefaultLimit({
    limit: options.limit,
    page: options.page,
    filter: options.filter,
    order: options.order ?? 'created_at desc',
    include: 'member,post,parent',
    include_nested: options.includeNested === false ? false : undefined,
  });

  if (!allPages) {
    return client.comments.browseAll(params);
  }

  return collectAllPages('comments', (page) => client.comments.browseAll({ ...params, page }));
}

export async function getComment(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.comments.readForModeration(id);
}

export async function getCommentThread(
  global: GlobalOptions,
  id: string,
): Promise<CommentThreadPayload> {
  const client = await getClient(global);
  const [selectedPayload, threadPayload] = await Promise.all([
    client.comments.readForModeration(id),
    collectAllPages('comments', (page) => client.comments.browseThread(id, { page })),
  ]);

  const selectedComment = Array.isArray(selectedPayload.comments)
    ? ((selectedPayload.comments[0] as Record<string, unknown> | undefined) ?? null)
    : null;
  const threadComments = Array.isArray(threadPayload.comments)
    ? (threadPayload.comments as Array<Record<string, unknown>>)
    : [];

  return {
    comment: selectedComment,
    comments: threadComments,
    meta:
      (threadPayload.meta as Record<string, unknown> | undefined) ??
      (selectedPayload.meta as Record<string, unknown> | undefined),
  };
}

export async function listCommentReplies(
  global: GlobalOptions,
  id: string,
  options: CommentRepliesOptions,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);
  const params = withDefaultLimit({
    limit: options.limit,
    page: options.page,
    filter: options.filter,
    include: 'member,post,count.replies,count.likes,count.reports,parent',
  });

  if (!allPages) {
    return client.comments.replies(id, params);
  }

  return collectAllPages('comments', (page) => client.comments.replies(id, { ...params, page }));
}

export async function listCommentLikes(
  global: GlobalOptions,
  id: string,
  options: CommentRelationOptions,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);
  const params = withDefaultLimit({
    limit: options.limit,
    page: options.page,
    include: 'member',
    order: 'created_at desc',
  });

  if (!allPages) {
    return client.comments.likes(id, params);
  }

  return collectAllPages('comment_likes', (page) => client.comments.likes(id, { ...params, page }));
}

export async function listCommentReports(
  global: GlobalOptions,
  id: string,
  options: CommentRelationOptions,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);
  const params = withDefaultLimit({
    limit: options.limit,
    page: options.page,
  });

  if (!allPages) {
    return client.comments.reports(id, params);
  }

  return collectAllPages('comment_reports', (page) =>
    client.comments.reports(id, { ...params, page }),
  );
}

export async function setCommentStatus(
  global: GlobalOptions,
  id: string,
  status: CommentStatus,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.comments.setStatus(id, status);
}
