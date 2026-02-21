import type { GhostPaginatedResponse } from './client.js';

interface PaginationMeta {
  page?: number;
  pages?: number;
  next?: number | null;
  prev?: number | null;
  limit?: number;
  total?: number;
}

function getPagination(payload: GhostPaginatedResponse): PaginationMeta {
  const meta = payload.meta as Record<string, unknown> | undefined;
  const pagination = meta?.pagination as PaginationMeta | undefined;
  return pagination ?? {};
}

export async function collectAllPages(
  key: string,
  fetchPage: (page: number) => Promise<GhostPaginatedResponse>,
): Promise<GhostPaginatedResponse> {
  const first = await fetchPage(1);
  const initial = Array.isArray(first[key]) ? [...(first[key] as unknown[])] : [];

  const firstPagination = getPagination(first);
  const pages = Number(firstPagination.pages ?? 1);

  for (let page = 2; page <= pages; page += 1) {
    const nextPayload = await fetchPage(page);
    const nextItems = Array.isArray(nextPayload[key]) ? (nextPayload[key] as unknown[]) : [];
    initial.push(...nextItems);
  }

  const mergedPagination: PaginationMeta = {
    ...firstPagination,
    page: 1,
    pages: 1,
    next: null,
    prev: null,
    total: initial.length,
    limit: initial.length,
  };

  const meta = {
    ...(typeof first.meta === 'object' && first.meta !== null ? first.meta : {}),
    pagination: mergedPagination,
  };

  return {
    ...first,
    [key]: initial,
    meta,
  };
}
