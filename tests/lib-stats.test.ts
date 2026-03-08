import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';
import {
  getStatsGrowth,
  getStatsNewsletterClicks,
  getStatsNewsletterSubscribers,
  getStatsNewsletters,
  getStatsOverview,
  getStatsPost,
  getStatsPostGrowth,
  getStatsPostNewsletter,
  getStatsPostReferrers,
  getStatsPosts,
  getStatsPostWeb,
  getStatsWeb,
  getStatsWebTable,
} from '../src/lib/stats.js';
import { fixtureIds } from './helpers/ghost-fixtures.js';
import { installGhostFixtureFetchMock } from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

describe('stats library', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-lib-stats-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    await fs.writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify(
        {
          version: 1,
          active: 'myblog',
          sites: {
            myblog: {
              url: 'https://myblog.ghost.io',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(previousCwd);
    if (previousConfigDir === undefined) {
      delete process.env.GHST_CONFIG_DIR;
    } else {
      process.env.GHST_CONFIG_DIR = previousConfigDir;
    }
  });

  test('retrieves site web analytics via Ghost bootstrap plus Tinybird queries', async () => {
    const requests: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: ({ url }) => {
        requests.push(url.toString());
        return undefined;
      },
    });

    const payload = await getStatsWeb({}, { range: '30d' });

    expect(payload.range.timezone).toBe('Etc/UTC');
    expect(payload.kpis.visits).toBe(240);
    expect(payload.kpis.bounce_rate).toBeCloseTo(41.71, 2);
    expect(payload.timeseries).toEqual([
      {
        date: '2026-03-01',
        visits: 100,
        pageviews: 150,
        bounce_rate: 40,
        avg_session_sec: 100,
      },
      {
        date: '2026-03-02',
        visits: 140,
        pageviews: 210,
        bounce_rate: 42.93,
        avg_session_sec: 115.43,
      },
    ]);
    expect(payload.content[0]?.title).toBe('Fixture Post');
    expect(payload.sources[0]?.label).toBe('Twitter');
    expect(requests.some((entry) => entry.endsWith('/ghost/api/admin/config/'))).toBe(true);
    expect(requests.some((entry) => entry.endsWith('/ghost/api/admin/settings/'))).toBe(true);
    expect(requests.some((entry) => entry.endsWith('/ghost/api/admin/site/'))).toBe(true);
    expect(requests.some((entry) => entry.endsWith('/ghost/api/admin/tinybird/token/'))).toBe(true);
    expect(
      requests.some((entry) => entry.includes('analytics.example.com/v0/pipes/api_kpis_v2.json')),
    ).toBe(true);
    expect(requests.some((entry) => entry.includes('/ghost/api/admin/stats/top-content/'))).toBe(
      true,
    );
  });

  test('aggregates multi-row KPI series and uses an explicit all-time lower bound', async () => {
    const requests: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: ({ url }) => {
        requests.push(url.toString());
        return undefined;
      },
    });

    const payload = await getStatsWeb({}, { range: 'all' });

    expect(payload.kpis.visits).toBe(240);
    expect(payload.kpis.pageviews).toBe(360);
    expect(payload.kpis.bounce_rate).toBeCloseTo(41.7, 1);
    expect(payload.kpis.avg_session_sec).toBeCloseTo(109, 0);
    expect(
      requests.some(
        (entry) =>
          entry.includes('analytics.example.com/v0/pipes/api_kpis_v2.json') &&
          entry.includes('date_from=1970-01-01'),
      ),
    ).toBe(true);
    expect(
      requests.some(
        (entry) =>
          entry.includes('/ghost/api/admin/stats/top-content/') &&
          entry.includes('date_from=1970-01-01'),
      ),
    ).toBe(true);
  });

  test('uses Ghost stats endpoints for growth data without Tinybird reads', async () => {
    const requests: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: ({ url }) => {
        requests.push(url.toString());
        return undefined;
      },
    });

    const payload = await getStatsGrowth({}, { range: '90d' });

    expect(payload.summary.total_members).toBe(157);
    expect(payload.summary.mrr).toBe(1540);
    expect(payload.summary.total_subscriptions).toBe(31);
    expect(requests.some((entry) => entry.includes('/ghost/api/admin/stats/member_count/'))).toBe(
      true,
    );
    expect(requests.some((entry) => entry.includes('/ghost/api/admin/stats/mrr/'))).toBe(true);
    expect(requests.some((entry) => entry.includes('analytics.example.com/v0/pipes/'))).toBe(false);
  });

  test('includes growth deltas in the overview summary', async () => {
    installGhostFixtureFetchMock();

    const payload = await getStatsOverview({}, { range: '90d' });

    expect(payload.summary.total_members).toBe(157);
    expect(payload.summary.member_delta).toBe(23);
    expect(payload.summary.paid_members).toBe(31);
    expect(payload.summary.paid_delta).toBe(7);
    expect(payload.summary.mrr).toBe(1540);
    expect(payload.summary.mrr_delta).toBe(360);
  });

  test('normalizes Ghost member_count rows that use free and paid fields', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/stats/member_count/') && method === 'GET') {
          return new Response(
            JSON.stringify({
              stats: [
                { date: '2026-02-06', free: 265, paid: 0, comped: 0 },
                { date: '2026-03-02', free: 280, paid: 0, comped: 0 },
              ],
              meta: {
                totals: {
                  free: 280,
                  paid: 0,
                  comped: 0,
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return undefined;
      },
    });

    const payload = await getStatsGrowth({}, { from: '2026-02-06', to: '2026-03-02' });

    expect(payload.summary.free_members).toBe(280);
    expect(payload.summary.paid_members).toBe(0);
    expect(payload.summary.total_members).toBe(280);
    expect(payload.summary.member_delta).toBe(15);
    expect(payload.members).toEqual([
      {
        date: '2026-02-06',
        free_members: 265,
        paid_members: 0,
        total_members: 265,
        mrr: null,
        subscriptions: null,
      },
      {
        date: '2026-03-02',
        free_members: 280,
        paid_members: 0,
        total_members: 280,
        mrr: null,
        subscriptions: null,
      },
    ]);
  });

  test('clips growth histories client-side to the selected range', async () => {
    installGhostFixtureFetchMock();

    const payload = await getStatsGrowth({}, { from: '2026-03-01', to: '2026-03-01' });

    expect(payload.members).toHaveLength(1);
    expect(payload.members[0]?.date).toBe('2026-03-01');
    expect(payload.summary.total_members).toBe(157);
    expect(payload.summary.member_delta).toBe(0);
    expect(payload.mrr).toHaveLength(1);
    expect(payload.summary.mrr).toBe(1540);
    expect(payload.summary.mrr_delta).toBe(0);
    expect(payload.subscriptions.history).toHaveLength(1);
    expect(payload.summary.total_subscriptions).toBe(31);
    expect(payload.summary.subscription_delta).toBe(0);
  });

  test('scopes post web analytics by post uuid', async () => {
    const requests: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: ({ url }) => {
        requests.push(url.toString());
        return undefined;
      },
    });

    const payload = await getStatsPostWeb({}, { id: fixtureIds.postId, range: '7d' });

    expect(payload.post.title).toBe('Fixture Post');
    expect(payload.kpis.visits).toBe(34);
    expect(payload.timeseries).toEqual([
      {
        date: '2026-03-01',
        visits: 14,
        pageviews: 20,
        bounce_rate: 25,
        avg_session_sec: 70,
      },
      {
        date: '2026-03-02',
        visits: 20,
        pageviews: 28,
        bounce_rate: 37.75,
        avg_session_sec: 90.4,
      },
    ]);
    expect(
      requests.some(
        (entry) =>
          entry.includes('analytics.example.com/v0/pipes/api_kpis_v2.json') &&
          entry.includes('post_uuid=11111111-1111-4111-8111-111111111111'),
      ),
    ).toBe(true);
  });

  test('retrieves newsletter and post analytics variants', async () => {
    installGhostFixtureFetchMock();

    const newsletters = await getStatsNewsletters({}, { range: '30d', limit: 10 });
    const subscribers = await getStatsNewsletterSubscribers({}, { range: '30d' });
    const clicks = await getStatsNewsletterClicks(
      {},
      { newsletterId: fixtureIds.newsletterId, limit: 10 },
    );
    const post = await getStatsPost({}, { id: fixtureIds.postId, range: '30d' });
    const postGrowth = await getStatsPostGrowth({}, { id: fixtureIds.postId, range: '30d' });
    const postReferrers = await getStatsPostReferrers(
      {},
      { id: fixtureIds.postId, range: '30d', limit: 10 },
    );
    const postNewsletter = await getStatsPostNewsletter(
      {},
      { id: fixtureIds.postId, range: '30d' },
    );
    const posts = await getStatsPosts({}, { range: '30d', limit: 5 });
    const devices = await getStatsWebTable({}, 'devices', { range: '30d', limit: 10 });

    expect(newsletters.newsletters[0]?.newsletter_name).toBe('ghst');
    expect(newsletters.newsletters[0]?.recipients).toBe(120);
    expect(newsletters.newsletters[0]?.clicked).toBe(24);
    expect(newsletters.newsletters[0]?.click_rate).toBe(20);
    expect(subscribers.newsletters[0]?.subscribers).toBe(420);
    expect(clicks.clicks[0]?.clicks).toBe(24);
    expect(clicks.clicks[0]?.recipients).toBe(120);
    expect(clicks.clicks[0]?.click_rate).toBe(20);
    expect(post.summary.email_recipients).toBe(120);
    expect(postGrowth.growth[0]?.free_members).toBe(9);
    expect(postReferrers.referrers[0]?.source).toBe('Twitter');
    expect(postNewsletter.newsletter.open_rate).toBe(65);
    expect(posts.posts[0]?.title).toBe('Fixture Post');
    expect(posts.posts[0]?.views).toBe(120);
    expect(posts.posts[0]?.click_rate).toBe(20);
    expect(devices.metric).toBe('devices');
  });

  test('aggregates all newsletter sends before applying the report row limit', async () => {
    const requests: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method, url }) => {
        requests.push(url.toString());

        if (
          pathname.endsWith('/ghost/api/admin/stats/newsletter-basic-stats/') &&
          method === 'GET'
        ) {
          return new Response(
            JSON.stringify({
              stats: [
                {
                  post_id: fixtureIds.postId,
                  post_title: 'Fixture Post',
                  send_date: '2026-03-01T00:00:00.000Z',
                  sent_to: 120,
                  total_opens: 78,
                  open_rate: 0.65,
                },
                {
                  post_id: 'post-secondary',
                  post_title: 'Second Fixture Post',
                  send_date: '2026-03-02T00:00:00.000Z',
                  sent_to: 30,
                  total_opens: 15,
                  open_rate: 0.5,
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (
          pathname.endsWith('/ghost/api/admin/stats/newsletter-click-stats/') &&
          method === 'GET'
        ) {
          return new Response(
            JSON.stringify({
              stats: [
                {
                  post_id: fixtureIds.postId,
                  total_clicks: 24,
                  email_count: 120,
                  click_rate: 0.2,
                },
                {
                  post_id: 'post-secondary',
                  total_clicks: 6,
                  email_count: 30,
                  click_rate: 0.2,
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return undefined;
      },
    });

    const payload = await getStatsNewsletters({}, { range: '30d', limit: 1 });

    expect(payload.newsletters).toHaveLength(1);
    expect(payload.newsletters[0]?.sent_posts).toBe(2);
    expect(payload.newsletters[0]?.recipients).toBe(150);
    expect(payload.newsletters[0]?.opened).toBe(93);
    expect(payload.newsletters[0]?.clicked).toBe(30);
    expect(payload.newsletters[0]?.click_rate).toBe(20);
    expect(
      requests.some(
        (entry) =>
          entry.includes('/ghost/api/admin/stats/newsletter-basic-stats/') &&
          entry.includes(`newsletter_id=${fixtureIds.newsletterId}`) &&
          !entry.includes('limit='),
      ),
    ).toBe(true);
  });

  test('treats timezone-only post growth requests as lifetime scope and clips explicit windows', async () => {
    installGhostFixtureFetchMock();

    const lifetime = await getStatsPostGrowth({}, { id: fixtureIds.postId, timezone: 'Etc/UTC' });
    const windowed = await getStatsPostGrowth(
      {},
      { id: fixtureIds.postId, from: '2026-03-01', to: '2026-03-01' },
    );

    expect(lifetime.range.from).toBeNull();
    expect(lifetime.growth).toHaveLength(2);
    expect(windowed.range.from).toBe('2026-03-01');
    expect(windowed.growth).toEqual([
      { date: '2026-03-01', free_members: 9, paid_members: 3, mrr: 178 },
    ]);
  });

  test('uses the resolved default range for embedded post growth data', async () => {
    installGhostFixtureFetchMock();

    const payload = await getStatsPost({}, { id: fixtureIds.postId });

    expect(payload.range.from).not.toBeNull();
    expect(payload.growth).toEqual([
      { date: '2026-03-01', free_members: 9, paid_members: 3, mrr: 178 },
    ]);
  });

  test('filters newsletter click stats by explicit post ids without adding date filters to the click endpoint', async () => {
    const requests: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: ({ url }) => {
        requests.push(url.toString());
        return undefined;
      },
    });

    const clicks = await getStatsNewsletterClicks(
      {},
      {
        newsletterId: fixtureIds.newsletterId,
        postIds: [fixtureIds.postId],
        range: '30d',
        limit: 10,
      },
    );

    expect(clicks.clicks).toHaveLength(1);
    expect(clicks.clicks[0]?.post_title).toBe('Fixture Post');
    expect(clicks.clicks[0]?.send_date).toBe('2026-03-01T00:00:00.000Z');
    expect(clicks.clicks[0]?.click_rate).toBe(20);
    expect(
      requests.some(
        (entry) =>
          entry.includes('/ghost/api/admin/stats/newsletter-click-stats/') &&
          entry.includes(`post_ids=${fixtureIds.postId}`) &&
          !entry.includes('date_from='),
      ),
    ).toBe(true);
  });

  test('propagates post web auth failures instead of returning a partial post report', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/tinybird/token/') && method === 'GET') {
          return new Response(
            JSON.stringify({
              errors: [{ message: 'Forbidden' }],
            }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return undefined;
      },
    });

    await expect(getStatsPost({}, { id: fixtureIds.postId, range: '30d' })).rejects.toMatchObject({
      exitCode: ExitCode.AUTH_ERROR,
    });
  });

  test('returns an empty newsletter click report when the requested post ids are outside the selected range', async () => {
    installGhostFixtureFetchMock();

    const clicks = await getStatsNewsletterClicks(
      {},
      {
        newsletterId: fixtureIds.newsletterId,
        postIds: ['missing-post'],
        range: '30d',
        limit: 10,
      },
    );

    expect(clicks.clicks).toEqual([]);
  });

  test('raises analytics-specific errors for missing analytics config and missing newsletters', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/config/') && method === 'GET') {
          return new Response(
            JSON.stringify({
              config: {
                version: '6.0',
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return undefined;
      },
    });

    await expect(getStatsWeb({}, { range: '30d' })).rejects.toMatchObject({
      code: 'ANALYTICS_UNAVAILABLE',
      exitCode: ExitCode.GENERAL_ERROR,
    });

    vi.restoreAllMocks();
    installGhostFixtureFetchMock();
    await expect(
      getStatsNewsletterClicks({}, { newsletterId: 'missing-newsletter', limit: 10 }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      exitCode: ExitCode.NOT_FOUND,
    });
  });

  test('maps Tinybird token auth failures to AUTH_ERROR', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/tinybird/token/') && method === 'GET') {
          return new Response(
            JSON.stringify({
              errors: [{ message: 'Forbidden' }],
            }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return undefined;
      },
    });

    await expect(getStatsWeb({}, { range: '30d' })).rejects.toMatchObject({
      exitCode: ExitCode.AUTH_ERROR,
    });
  });

  test('falls back to top-posts-views when Ghost post stats omit email and membership totals', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (
          pathname.endsWith(`/ghost/api/admin/stats/posts/${fixtureIds.postId}/stats/`) &&
          method === 'GET'
        ) {
          return new Response(
            JSON.stringify({
              stats: {
                visitors: 34,
                pageviews: 48,
                free_members: 0,
                paid_members: 0,
                mrr: 0,
                email_recipients: 0,
                email_open_rate: 0,
                email_click_rate: 0,
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return undefined;
      },
    });

    const post = await getStatsPost({}, { id: fixtureIds.postId, range: '30d' });
    const newsletter = await getStatsPostNewsletter({}, { id: fixtureIds.postId, range: '30d' });

    expect(post.summary.free_members).toBe(9);
    expect(post.summary.paid_members).toBe(3);
    expect(post.summary.email_recipients).toBe(120);
    expect(post.summary.email_open_rate).toBe(65);
    expect(post.summary.email_click_rate).toBe(20);
    expect(newsletter.newsletter.recipients).toBe(120);
    expect(newsletter.newsletter.open_rate).toBe(65);
    expect(newsletter.newsletter.click_rate).toBe(20);
  });
});
