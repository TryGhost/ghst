import { vi } from 'vitest';
import { cloneFixture, fixtureIds, ghostFixtures } from './ghost-fixtures.js';

export interface MockGhostRequest {
  url: URL;
  pathname: string;
  method: string;
  init: RequestInit | undefined;
}

export interface CreateGhostFixtureMockOptions {
  postConflictOnce?: boolean;
  onRequest?: (request: MockGhostRequest) => Response | undefined | Promise<Response | undefined>;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function unknownRouteResponse(pathname: string): Response {
  const fixture = ghostFixtures.api.errors.unknownRoute404 as Record<string, unknown>;
  const status = Number(fixture.status ?? 404);
  const payload = cloneFixture((fixture.payload as Record<string, unknown>) ?? {});

  if (payload.errors && Array.isArray(payload.errors) && payload.errors.length > 0) {
    return jsonResponse(payload, status);
  }

  return jsonResponse({ errors: [{ message: `Unhandled route: ${pathname}` }] }, status);
}

export function createGhostFixtureFetchHandler(options: CreateGhostFixtureMockOptions = {}) {
  let conflictCount = 0;

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const pathname = url.pathname;

    const request: MockGhostRequest = { url, pathname, method, init };
    const overridden = await options.onRequest?.(request);
    if (overridden) {
      return overridden;
    }

    if (pathname.endsWith('/ghost/api/admin/site/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.api.admin.site));
    }

    if (pathname.endsWith('/ghost/api/admin/settings/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.api.admin.settings));
    }

    if (pathname.endsWith('/ghost/api/content/posts/') && method === 'GET') {
      return jsonResponse({ posts: [] });
    }

    if (pathname.endsWith('/ghost/api/admin/posts/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.posts.browse));
    }

    if (pathname.endsWith(`/ghost/api/admin/posts/${fixtureIds.postId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.posts.read));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/posts/slug/${fixtureIds.postSlug}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.posts.read));
    }

    if (pathname.endsWith('/ghost/api/admin/posts/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.posts.create));
    }

    if (pathname.endsWith(`/ghost/api/admin/posts/${fixtureIds.postId}/`) && method === 'PUT') {
      if (options.postConflictOnce && conflictCount === 0) {
        conflictCount += 1;
        const conflictFixture = ghostFixtures.posts.conflict409 as Record<string, unknown>;
        return jsonResponse(
          cloneFixture((conflictFixture.payload as Record<string, unknown>) ?? {}),
          Number(conflictFixture.status ?? 409),
        );
      }

      const isPublishRequest = String(init?.body ?? '').includes('"status":"published"');
      if (isPublishRequest) {
        const payload = cloneFixture(ghostFixtures.posts.update) as Record<string, unknown>;
        const posts = payload.posts as Array<Record<string, unknown>>;
        if (posts[0]) {
          posts[0].status = 'published';
        }
        return jsonResponse(payload);
      }

      return jsonResponse(cloneFixture(ghostFixtures.posts.update));
    }

    if (pathname.endsWith(`/ghost/api/admin/posts/${fixtureIds.postId}/`) && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    if (pathname.endsWith('/ghost/api/admin/pages/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.pages.browse));
    }

    if (pathname.endsWith(`/ghost/api/admin/pages/${fixtureIds.pageId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.pages.read));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/pages/slug/${fixtureIds.pageSlug}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.pages.read));
    }

    if (pathname.endsWith('/ghost/api/admin/pages/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.pages.create));
    }

    if (pathname.endsWith(`/ghost/api/admin/pages/${fixtureIds.pageId}/`) && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.pages.update));
    }

    if (pathname.endsWith(`/ghost/api/admin/pages/${fixtureIds.pageId}/`) && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    if (pathname.endsWith('/ghost/api/admin/tags/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.tags.browse));
    }

    if (pathname.endsWith(`/ghost/api/admin/tags/${fixtureIds.tagId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.tags.read));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/tags/slug/${fixtureIds.tagSlug}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.tags.read));
    }

    if (pathname.endsWith('/ghost/api/admin/tags/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.tags.create));
    }

    if (pathname.endsWith(`/ghost/api/admin/tags/${fixtureIds.tagId}/`) && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.tags.update));
    }

    if (pathname.endsWith(`/ghost/api/admin/tags/${fixtureIds.tagId}/`) && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    return unknownRouteResponse(pathname);
  };
}

export function installGhostFixtureFetchMock(options?: CreateGhostFixtureMockOptions) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(createGhostFixtureFetchHandler(options));
}

export { jsonResponse };
