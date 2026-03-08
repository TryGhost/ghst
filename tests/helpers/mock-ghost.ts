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
  const statsConfig = {
    id: 'site-uuid',
    endpoint: 'https://analytics.example.com',
    endpointBrowser: 'https://analytics.example.com',
    version: 'v2',
  };

  const topContentStats = [
    {
      id: fixtureIds.postId,
      post_id: fixtureIds.postId,
      post_uuid: '11111111-1111-4111-8111-111111111111',
      title: 'Fixture Post',
      pathname: '/welcome/',
      url: 'https://myblog.ghost.io/welcome/',
      type: 'post',
      visits: 120,
      pageviews: 160,
    },
    {
      id: fixtureIds.pageId,
      post_id: fixtureIds.pageId,
      post_uuid: '22222222-2222-4222-8222-222222222222',
      title: 'Fixture Page',
      pathname: '/about/',
      url: 'https://myblog.ghost.io/about/',
      type: 'page',
      visits: 45,
      pageviews: 60,
    },
  ];

  const topSourcesGrowthStats = [
    { source: 'Twitter', visits: 50, signups: 12, paid_conversions: 3, mrr: 300 },
    { source: 'Direct', visits: 36, signups: 9, paid_conversions: 2, mrr: 180 },
    { source: 'Google', visits: 28, signups: 5, paid_conversions: 1, mrr: 90 },
  ];

  const postReferrersStats = [
    { source: 'Twitter', visits: 18, signups: 4, paid_conversions: 1, mrr: 99 },
    { source: 'Direct', visits: 12, signups: 2, paid_conversions: 1, mrr: 79 },
    { source: 'Google', visits: 8, signups: 1, paid_conversions: 0, mrr: 0 },
  ];

  function applyLimit<T>(items: T[], url: URL): T[] {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit ? Number(rawLimit) : undefined;
    if (!limit || !Number.isFinite(limit) || limit <= 0) {
      return items;
    }

    return items.slice(0, limit);
  }

  function tinybirdResponse(pathname: string, url: URL): Response {
    const pipe = pathname
      .replace('/v0/pipes/', '')
      .replace(/\.json$/, '')
      .replace(/_v\d+$/, '');
    const postScoped = url.searchParams.get('post_uuid') === '11111111-1111-4111-8111-111111111111';

    if (pipe === 'api_kpis') {
      return jsonResponse({
        data: [
          {
            date: '2026-03-01',
            visits: postScoped ? 14 : 100,
            pageviews: postScoped ? 20 : 150,
            bounce_rate: postScoped ? 0.25 : 0.4,
            avg_session_sec: postScoped ? 70 : 100,
          },
          {
            date: '2026-03-02',
            visits: postScoped ? 20 : 140,
            pageviews: postScoped ? 28 : 210,
            bounce_rate: postScoped ? 0.3775 : 0.4293,
            avg_session_sec: postScoped ? 90.4 : 115.43,
          },
        ],
      });
    }

    if (pipe === 'api_active_visitors') {
      return jsonResponse({
        data: [{ active_visitors: postScoped ? 3 : 11 }],
      });
    }

    if (pipe === 'api_top_sources') {
      return jsonResponse({
        data: applyLimit(
          postScoped
            ? [
                { source: 'Twitter', visits: 14, signups: 4, paid_conversions: 1, mrr: 99 },
                { source: 'Direct', visits: 10, signups: 2, paid_conversions: 1, mrr: 79 },
              ]
            : topSourcesGrowthStats,
          url,
        ),
      });
    }

    if (pipe === 'api_top_locations') {
      return jsonResponse({
        data: applyLimit(
          postScoped
            ? [
                { location: 'US', visits: 16 },
                { location: 'GB', visits: 8 },
              ]
            : [
                { location: 'US', visits: 88 },
                { location: 'GB', visits: 40 },
                { location: 'CA', visits: 22 },
              ],
          url,
        ),
      });
    }

    if (pipe === 'api_top_devices') {
      return jsonResponse({
        data: applyLimit(
          [
            { device: 'desktop', visits: 140 },
            { device: 'mobile-ios', visits: 70 },
            { device: 'mobile-android', visits: 30 },
          ],
          url,
        ),
      });
    }

    if (pipe === 'api_top_utm_sources') {
      return jsonResponse({
        data: applyLimit(
          [
            { utm_source: 'twitter', visits: 45 },
            { utm_source: 'newsletter', visits: 31 },
          ],
          url,
        ),
      });
    }

    if (pipe === 'api_top_utm_mediums') {
      return jsonResponse({
        data: applyLimit(
          [
            { utm_medium: 'social', visits: 45 },
            { utm_medium: 'email', visits: 31 },
          ],
          url,
        ),
      });
    }

    if (pipe === 'api_top_utm_campaigns') {
      return jsonResponse({
        data: applyLimit(
          [
            { utm_campaign: 'launch', visits: 28 },
            { utm_campaign: 'spring-sale', visits: 19 },
          ],
          url,
        ),
      });
    }

    if (pipe === 'api_top_utm_contents') {
      return jsonResponse({
        data: applyLimit(
          [
            { utm_content: 'hero-link', visits: 18 },
            { utm_content: 'footer-link', visits: 12 },
          ],
          url,
        ),
      });
    }

    if (pipe === 'api_top_utm_terms') {
      return jsonResponse({
        data: applyLimit(
          [
            { utm_term: 'ghost cli', visits: 9 },
            { utm_term: 'analytics', visits: 5 },
          ],
          url,
        ),
      });
    }

    return jsonResponse({ data: [] });
  }

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const pathname = url.pathname;

    const request: MockGhostRequest = { url, pathname, method, init };
    const overridden = await options.onRequest?.(request);
    if (overridden) {
      return overridden;
    }

    if (url.hostname === 'analytics.example.com' && pathname.startsWith('/v0/pipes/')) {
      return tinybirdResponse(pathname, url);
    }

    if ((pathname === '/ghost' || pathname === '/ghost/') && method === 'GET') {
      return textResponse('<html><body>Ghost Admin</body></html>', 200, 'text/html; charset=utf-8');
    }

    if (pathname.endsWith('/ghost/api/admin/config/') && method === 'GET') {
      return jsonResponse({
        config: {
          version: '6.0',
          stats: statsConfig,
        },
      });
    }

    if (pathname.endsWith('/ghost/api/admin/site/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.api.admin.site));
    }

    if (pathname.endsWith('/ghost/api/admin/settings/') && method === 'GET') {
      return jsonResponse(cloneFixture(ghostFixtures.api.admin.settings));
    }

    if (pathname.endsWith('/ghost/api/admin/tinybird/token/') && method === 'GET') {
      return jsonResponse({
        tinybird: {
          token: 'tinybird-token',
          exp: '2026-03-08T00:00:00.000Z',
        },
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/top-content/') && method === 'GET') {
      return jsonResponse({
        stats: applyLimit(topContentStats, url),
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/top-posts-views/') && method === 'GET') {
      return jsonResponse({
        stats: applyLimit(
          [
            {
              post_id: fixtureIds.postId,
              title: 'Fixture Post',
              published_at: '2026-03-02T10:00:00.000Z',
              feature_image: 'https://myblog.ghost.io/content/images/welcome.png',
              status: 'published',
              authors: 'Fixture Author',
              views: 120,
              sent_count: 120,
              opened_count: 78,
              open_rate: 65,
              clicked_count: 24,
              click_rate: 20,
              members: 9,
              free_members: 6,
              paid_members: 3,
            },
            {
              post_id: 'post-secondary',
              title: 'Second Fixture Post',
              published_at: '2026-02-20T10:00:00.000Z',
              feature_image: null,
              status: 'published',
              authors: 'Fixture Author, Another Author',
              views: 45,
              sent_count: null,
              opened_count: null,
              open_rate: null,
              clicked_count: 0,
              click_rate: null,
              members: 2,
              free_members: 2,
              paid_members: 0,
            },
          ],
          url,
        ),
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/member_count/') && method === 'GET') {
      return jsonResponse({
        stats: [
          {
            date: '2026-02-01',
            free_members: 110,
            paid_members: 24,
            all_members: 134,
          },
          {
            date: '2026-03-01',
            free_members: 126,
            paid_members: 31,
            all_members: 157,
          },
        ],
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/mrr/') && method === 'GET') {
      return jsonResponse({
        stats: [
          { date: '2026-02-01', mrr: 1180, currency: 'usd' },
          { date: '2026-03-01', mrr: 1540, currency: 'usd' },
        ],
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/subscriptions/') && method === 'GET') {
      return jsonResponse({
        stats: [
          { date: '2026-02-01', tier: fixtureIds.tierId, count: 24 },
          { date: '2026-03-01', tier: fixtureIds.tierId, count: 31 },
        ],
        meta: {
          totals: [{ tier: fixtureIds.tierId, label: 'Default Product', count: 31 }],
        },
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/top-sources-growth/') && method === 'GET') {
      return jsonResponse({
        stats: applyLimit(topSourcesGrowthStats, url),
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/newsletter-basic-stats/') && method === 'GET') {
      const newsletterId = url.searchParams.get('newsletter_id');
      const sentStats =
        newsletterId === fixtureIds.newsletterId
          ? [
              {
                post_id: fixtureIds.postId,
                post_title: 'Fixture Post',
                send_date: '2026-03-01T00:00:00.000Z',
                sent_to: 120,
                total_opens: 78,
                open_rate: 0.65,
              },
            ]
          : [];

      return jsonResponse({ stats: sentStats });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/newsletter-stats/') && method === 'GET') {
      const newsletterId = url.searchParams.get('newsletter_id');
      const sentStats =
        newsletterId === fixtureIds.newsletterId
          ? [
              {
                post_id: fixtureIds.postId,
                post_title: 'Fixture Post',
                send_date: '2026-03-01T00:00:00.000Z',
                sent_to: 120,
                total_opens: 78,
                open_rate: 0.65,
                total_clicks: 24,
                click_rate: 0.2,
              },
            ]
          : [];

      return jsonResponse({ stats: sentStats });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/newsletter-click-stats/') && method === 'GET') {
      return jsonResponse({
        stats: [
          {
            post_id: fixtureIds.postId,
            total_clicks: 24,
            email_count: 120,
            click_rate: 0.2,
          },
        ],
      });
    }

    if (pathname.endsWith('/ghost/api/admin/stats/subscriber-count/') && method === 'GET') {
      const newsletterId = url.searchParams.get('newsletter_id');
      const total = newsletterId === fixtureIds.newsletterId ? 420 : 0;
      const delta = newsletterId === fixtureIds.newsletterId ? 17 : 0;

      return jsonResponse({
        stats: [
          { date: '2026-02-01', total: total - delta, delta: 0 },
          { date: '2026-03-01', total, delta },
        ],
      });
    }

    if (
      pathname.endsWith(`/ghost/api/admin/stats/posts/${fixtureIds.postId}/stats/`) &&
      method === 'GET'
    ) {
      return jsonResponse({
        stats: {
          visitors: 34,
          pageviews: 48,
          free_members: 9,
          paid_members: 3,
          mrr: 178,
          email_recipients: 120,
          email_open_rate: 65,
          email_click_rate: 13.33,
        },
      });
    }

    if (
      pathname.endsWith(`/ghost/api/admin/stats/posts/${fixtureIds.postId}/growth`) &&
      method === 'GET'
    ) {
      return jsonResponse({
        stats: [
          { date: '2026-02-01', free_members: 5, paid_members: 1, mrr: 59 },
          { date: '2026-03-01', free_members: 9, paid_members: 3, mrr: 178 },
        ],
      });
    }

    if (
      pathname.endsWith(`/ghost/api/admin/stats/posts/${fixtureIds.postId}/top-referrers`) &&
      method === 'GET'
    ) {
      return jsonResponse({
        stats: applyLimit(postReferrersStats, url),
      });
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
