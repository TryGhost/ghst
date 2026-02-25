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

function textResponse(
  data: string,
  status = 200,
  contentType = 'text/plain; charset=utf-8',
): Response {
  return new Response(data, {
    status,
    headers: { 'content-type': contentType },
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

    if ((pathname === '/ghost' || pathname === '/ghost/') && method === 'GET') {
      return textResponse('<html><body>Ghost Admin</body></html>', 200, 'text/html; charset=utf-8');
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

    if (
      pathname.endsWith(`/ghost/api/admin/posts/${fixtureIds.postId}/copy/`) &&
      method === 'POST'
    ) {
      return jsonResponse(
        cloneFixture(
          (ghostFixtures.posts.copy ?? ghostFixtures.posts.create) as Record<string, unknown>,
        ),
      );
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

    if (
      pathname.endsWith(`/ghost/api/admin/pages/${fixtureIds.pageId}/copy/`) &&
      method === 'POST'
    ) {
      return jsonResponse(
        cloneFixture(
          (ghostFixtures.pages.copy ?? ghostFixtures.pages.create) as Record<string, unknown>,
        ),
      );
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

    if (pathname.endsWith('/ghost/api/admin/members/upload/') && method === 'GET') {
      return textResponse(
        String(ghostFixtures.members.exportCsv ?? ''),
        200,
        'text/csv; charset=utf-8',
      );
    }

    if (pathname.endsWith('/ghost/api/admin/members/upload/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.members.importCsv));
    }

    if (pathname.endsWith('/ghost/api/admin/members/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.members.browse));
    }

    if (pathname.endsWith('/ghost/api/admin/members/bulk/') && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.members.bulkEdit));
    }

    if (pathname.endsWith('/ghost/api/admin/members/') && method === 'DELETE') {
      return jsonResponse(cloneFixture(ghostFixtures.members.bulkDestroy));
    }

    if (pathname.endsWith(`/ghost/api/admin/members/${fixtureIds.memberId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.members.read));
    }

    if (pathname.endsWith(`/ghost/api/admin/members/${fixtureIds.memberId}/`) && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.members.update));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/members/${fixtureIds.memberId}/`) &&
      method === 'DELETE'
    ) {
      return new Response(null, { status: 204 });
    }

    if (pathname.endsWith('/ghost/api/admin/members/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.members.create));
    }

    if (pathname.endsWith('/ghost/api/admin/newsletters/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.newsletters.browse));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/newsletters/${fixtureIds.newsletterId}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.newsletters.read));
    }

    if (pathname.endsWith('/ghost/api/admin/newsletters/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.newsletters.create));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/newsletters/${fixtureIds.newsletterId}/`) &&
      method === 'PUT'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.newsletters.update));
    }

    if (pathname.endsWith('/ghost/api/admin/tiers/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.tiers.browse));
    }

    if (pathname.endsWith(`/ghost/api/admin/tiers/${fixtureIds.tierId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.tiers.read));
    }

    if (pathname.endsWith('/ghost/api/admin/tiers/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.tiers.create));
    }

    if (pathname.endsWith(`/ghost/api/admin/tiers/${fixtureIds.tierId}/`) && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.tiers.update));
    }

    if (pathname.endsWith('/ghost/api/admin/offers/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.offers.browse));
    }

    if (pathname.endsWith(`/ghost/api/admin/offers/${fixtureIds.offerId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.offers.read));
    }

    if (pathname.endsWith('/ghost/api/admin/offers/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.offers.create));
    }

    if (pathname.endsWith(`/ghost/api/admin/offers/${fixtureIds.offerId}/`) && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.offers.update));
    }

    if (pathname.endsWith('/ghost/api/admin/labels/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.labels.browse));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/labels/slug/${fixtureIds.labelSlug}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.labels.read));
    }

    if (pathname.endsWith(`/ghost/api/admin/labels/${fixtureIds.labelId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.labels.read));
    }

    if (pathname.endsWith('/ghost/api/admin/labels/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.labels.create));
    }

    if (pathname.endsWith(`/ghost/api/admin/labels/${fixtureIds.labelId}/`) && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.labels.update));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/labels/${fixtureIds.labelId}/`) &&
      method === 'DELETE'
    ) {
      return new Response(null, { status: 204 });
    }

    if (pathname.endsWith('/ghost/api/admin/users/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.users.browse));
    }

    if (pathname.endsWith(`/ghost/api/admin/users/${fixtureIds.userId}/`) && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.users.readById));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/users/slug/${fixtureIds.userSlug}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.users.readBySlug));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/users/email/${fixtureIds.userEmail}/`) &&
      method === 'GET'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.users.readByEmail));
    }

    if (pathname.endsWith('/ghost/api/admin/users/me/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.users.me));
    }

    if (pathname.endsWith('/ghost/api/admin/webhooks/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.webhooks.create));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/webhooks/${fixtureIds.webhookId}/`) &&
      method === 'PUT'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.webhooks.update));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/webhooks/${fixtureIds.webhookId}/`) &&
      method === 'DELETE'
    ) {
      const fixture = cloneFixture(ghostFixtures.webhooks.delete) as Record<string, unknown>;
      if (Object.keys(fixture).length === 0) {
        return new Response(null, { status: 204 });
      }
      return jsonResponse(fixture);
    }

    if (pathname.endsWith('/ghost/api/admin/images/upload/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.images.upload));
    }

    if (pathname.endsWith('/ghost/api/admin/themes/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.themes.browse));
    }

    if (pathname.endsWith('/ghost/api/admin/themes/active/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.themes.active));
    }

    if (pathname.endsWith('/ghost/api/admin/themes/upload/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.themes.upload));
    }

    if (pathname.endsWith('/ghost/api/admin/themes/uploaded-theme/activate/') && method === 'PUT') {
      return jsonResponse(cloneFixture(ghostFixtures.themes.activate));
    }

    if (
      pathname.endsWith(`/ghost/api/admin/themes/${fixtureIds.themeName}/activate/`) &&
      method === 'PUT'
    ) {
      return jsonResponse(cloneFixture(ghostFixtures.themes.activate));
    }

    if (pathname.endsWith('/ghost/api/admin/settings/') && method === 'PUT') {
      const payload = cloneFixture(ghostFixtures.settingsAdmin.edit) as Record<string, unknown>;
      if (payload.status && payload.payload) {
        return jsonResponse({
          settings: [
            {
              key: 'title',
              value: 'Updated Blog',
              group: 'site',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        });
      }
      return jsonResponse(payload);
    }

    if (pathname.endsWith('/ghost/api/admin/db/') && method === 'GET') {
      const dbFixture = cloneFixture(ghostFixtures.db.export) as Record<string, unknown>;
      const byteLength = Number(dbFixture.bytes ?? 14);
      return new Response(Buffer.alloc(byteLength, 0), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      });
    }

    if (pathname.endsWith('/ghost/api/admin/db/') && method === 'POST') {
      return jsonResponse(cloneFixture(ghostFixtures.db.importSuccess));
    }

    return unknownRouteResponse(pathname);
  };
}

export function installGhostFixtureFetchMock(options?: CreateGhostFixtureMockOptions) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(createGhostFixtureFetchHandler(options));
}

export { jsonResponse };
