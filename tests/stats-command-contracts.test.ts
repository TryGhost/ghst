import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';

const statsMocks = vi.hoisted(() => ({
  getStatsOverview: vi.fn(),
  getStatsWeb: vi.fn(),
  getStatsWebTable: vi.fn(),
  getStatsGrowth: vi.fn(),
  getStatsPosts: vi.fn(),
  getStatsNewsletters: vi.fn(),
  getStatsNewsletterClicks: vi.fn(),
  getStatsNewsletterSubscribers: vi.fn(),
  getStatsPost: vi.fn(),
  getStatsPostWeb: vi.fn(),
  getStatsPostGrowth: vi.fn(),
  getStatsPostNewsletter: vi.fn(),
  getStatsPostReferrers: vi.fn(),
  printJson: vi.fn(),
  printStatsOverviewHuman: vi.fn(),
  printStatsWebHuman: vi.fn(),
  printStatsWebTableHuman: vi.fn(),
  printStatsGrowthHuman: vi.fn(),
  printStatsPostsHuman: vi.fn(),
  printStatsNewslettersHuman: vi.fn(),
  printStatsNewsletterClicksHuman: vi.fn(),
  printStatsNewsletterSubscribersHuman: vi.fn(),
  printStatsPostHuman: vi.fn(),
  printStatsPostWebHuman: vi.fn(),
  printStatsPostGrowthHuman: vi.fn(),
  printStatsPostNewsletterHuman: vi.fn(),
  printStatsPostReferrersHuman: vi.fn(),
}));

vi.mock('../src/lib/stats.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/stats.js')>('../src/lib/stats.js');
  return {
    ...actual,
    getStatsOverview: (...args: unknown[]) => statsMocks.getStatsOverview(...args),
    getStatsWeb: (...args: unknown[]) => statsMocks.getStatsWeb(...args),
    getStatsWebTable: (...args: unknown[]) => statsMocks.getStatsWebTable(...args),
    getStatsGrowth: (...args: unknown[]) => statsMocks.getStatsGrowth(...args),
    getStatsPosts: (...args: unknown[]) => statsMocks.getStatsPosts(...args),
    getStatsNewsletters: (...args: unknown[]) => statsMocks.getStatsNewsletters(...args),
    getStatsNewsletterClicks: (...args: unknown[]) => statsMocks.getStatsNewsletterClicks(...args),
    getStatsNewsletterSubscribers: (...args: unknown[]) =>
      statsMocks.getStatsNewsletterSubscribers(...args),
    getStatsPost: (...args: unknown[]) => statsMocks.getStatsPost(...args),
    getStatsPostWeb: (...args: unknown[]) => statsMocks.getStatsPostWeb(...args),
    getStatsPostGrowth: (...args: unknown[]) => statsMocks.getStatsPostGrowth(...args),
    getStatsPostNewsletter: (...args: unknown[]) => statsMocks.getStatsPostNewsletter(...args),
    getStatsPostReferrers: (...args: unknown[]) => statsMocks.getStatsPostReferrers(...args),
  };
});

vi.mock('../src/lib/output.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/output.js')>('../src/lib/output.js');
  return {
    ...actual,
    printJson: (...args: unknown[]) => statsMocks.printJson(...args),
    printStatsOverviewHuman: (...args: unknown[]) => statsMocks.printStatsOverviewHuman(...args),
    printStatsWebHuman: (...args: unknown[]) => statsMocks.printStatsWebHuman(...args),
    printStatsWebTableHuman: (...args: unknown[]) => statsMocks.printStatsWebTableHuman(...args),
    printStatsGrowthHuman: (...args: unknown[]) => statsMocks.printStatsGrowthHuman(...args),
    printStatsPostsHuman: (...args: unknown[]) => statsMocks.printStatsPostsHuman(...args),
    printStatsNewslettersHuman: (...args: unknown[]) =>
      statsMocks.printStatsNewslettersHuman(...args),
    printStatsNewsletterClicksHuman: (...args: unknown[]) =>
      statsMocks.printStatsNewsletterClicksHuman(...args),
    printStatsNewsletterSubscribersHuman: (...args: unknown[]) =>
      statsMocks.printStatsNewsletterSubscribersHuman(...args),
    printStatsPostHuman: (...args: unknown[]) => statsMocks.printStatsPostHuman(...args),
    printStatsPostWebHuman: (...args: unknown[]) => statsMocks.printStatsPostWebHuman(...args),
    printStatsPostGrowthHuman: (...args: unknown[]) =>
      statsMocks.printStatsPostGrowthHuman(...args),
    printStatsPostNewsletterHuman: (...args: unknown[]) =>
      statsMocks.printStatsPostNewsletterHuman(...args),
    printStatsPostReferrersHuman: (...args: unknown[]) =>
      statsMocks.printStatsPostReferrersHuman(...args),
  };
});

import { run } from '../src/index.js';

describe('stats command contracts', () => {
  let tempRoot = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-stats-coverage-'));

    statsMocks.getStatsOverview.mockResolvedValue({ summary: { members: 10 } });
    statsMocks.getStatsWeb.mockResolvedValue({ summary: { visits: 20 } });
    statsMocks.getStatsWebTable.mockResolvedValue({
      metric: 'sources',
      items: [{ label: 'Search', visits: 10, signups: 2, paid_conversions: 1, mrr: 9 }],
    });
    statsMocks.getStatsGrowth.mockResolvedValue({ growth: [{ date: '2026-03-01' }] });
    statsMocks.getStatsPosts.mockResolvedValue({
      posts: [
        {
          post_id: 'post-1',
          title: 'Post',
          published_at: '2026-03-01T00:00:00.000Z',
          status: 'published',
          authors: 'Author',
          views: 10,
          sent_count: 5,
          opened_count: 4,
          open_rate: 80,
          clicked_count: 2,
          click_rate: 40,
          members: 3,
          free_members: 2,
          paid_members: 1,
        },
      ],
    });
    statsMocks.getStatsNewsletters.mockResolvedValue({
      newsletters: [
        {
          newsletter_id: 'newsletter-1',
          newsletter_name: 'Weekly',
          newsletter_slug: 'weekly',
          sent_posts: 5,
          recipients: 100,
          open_rate: 55,
          click_rate: 22,
          subscribers: 300,
          subscriber_delta: 10,
        },
      ],
    });
    statsMocks.getStatsNewsletterClicks.mockResolvedValue({
      clicks: [
        {
          post_id: 'post-1',
          post_title: 'Post',
          send_date: '2026-03-01',
          recipients: 100,
          clicks: 20,
          click_rate: 20,
        },
      ],
    });
    statsMocks.getStatsNewsletterSubscribers.mockResolvedValue({
      newsletters: [
        {
          newsletter_id: 'newsletter-1',
          newsletter_name: 'Weekly',
          newsletter_slug: 'weekly',
          subscribers: 300,
          subscriber_delta: 10,
        },
      ],
    });
    statsMocks.getStatsPost.mockResolvedValue({ post: { id: 'post-1' } });
    statsMocks.getStatsPostWeb.mockResolvedValue({ sources: [] });
    statsMocks.getStatsPostGrowth.mockResolvedValue({
      growth: [{ date: '2026-03-01', free_members: 1, paid_members: 1, mrr: 9 }],
    });
    statsMocks.getStatsPostNewsletter.mockResolvedValue({ post: { id: 'post-1' } });
    statsMocks.getStatsPostReferrers.mockResolvedValue({
      referrers: [{ source: 'Search', visits: 10, signups: 2, paid_conversions: 1, mrr: 9 }],
    });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('routes json subcommands to the matching stats services', async () => {
    await expect(run(['node', 'ghst', '--json', 'stats', 'web'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', '--json', 'stats', 'growth'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', '--json', 'stats', 'posts'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', '--json', 'stats', 'post', 'post-1'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', '--json', 'stats', 'post', 'post-1', 'growth']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', '--json', 'stats', 'post', 'post-1', 'newsletter']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', '--json', 'stats', 'post', 'post-1', 'referrers']),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(statsMocks.printJson).toHaveBeenCalledTimes(7);
    expect(statsMocks.getStatsWeb).toHaveBeenCalledWith(expect.any(Object), {});
    expect(statsMocks.getStatsGrowth).toHaveBeenCalledWith(expect.any(Object), {
      from: undefined,
      limit: undefined,
      range: undefined,
      timezone: undefined,
      to: undefined,
    });
    expect(statsMocks.getStatsPosts).toHaveBeenCalledWith(expect.any(Object), {
      from: undefined,
      limit: 5,
      range: undefined,
      timezone: undefined,
      to: undefined,
    });
    expect(statsMocks.getStatsPost).toHaveBeenCalledWith(expect.any(Object), { id: 'post-1' });
    expect(statsMocks.getStatsPostGrowth).toHaveBeenCalledWith(expect.any(Object), {
      id: 'post-1',
    });
    expect(statsMocks.getStatsPostNewsletter).toHaveBeenCalledWith(expect.any(Object), {
      id: 'post-1',
    });
    expect(statsMocks.getStatsPostReferrers).toHaveBeenCalledWith(expect.any(Object), {
      id: 'post-1',
      range: undefined,
      from: undefined,
      to: undefined,
      timezone: undefined,
      limit: 10,
    });
  });

  test('writes csv output and preserves repeated --post filters for email reports', async () => {
    const newslettersCsvPath = path.join(tempRoot, 'newsletters.csv');
    const subscribersCsvPath = path.join(tempRoot, 'subscribers.csv');

    await expect(
      run(['node', 'ghst', 'stats', 'email', '--csv', '--output', newslettersCsvPath]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        '--json',
        'stats',
        'email',
        'clicks',
        '--newsletter',
        'newsletter-1',
        '--post',
        'post-1',
        '--post',
        'post-2',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'stats',
        'email',
        'subscribers',
        '--csv',
        '--output',
        subscribersCsvPath,
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(statsMocks.getStatsNewsletterClicks).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        newsletterId: 'newsletter-1',
        postIds: ['post-1', 'post-2'],
        limit: 10,
      }),
    );
    await expect(fs.readFile(newslettersCsvPath, 'utf8')).resolves.toContain(
      'newsletter_id,newsletter_name,newsletter_slug,sent_posts,recipients,open_rate,click_rate,subscribers,subscriber_delta',
    );
    await expect(fs.readFile(subscribersCsvPath, 'utf8')).resolves.toContain(
      'newsletter_id,newsletter_name,newsletter_slug,subscribers,subscriber_delta',
    );
  });

  test('rejects invalid csv combinations and invalid numeric limits', async () => {
    await expect(
      run(['node', 'ghst', 'stats', 'web', 'sources', '--output', 'out.csv']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', '--json', 'stats', 'web', 'sources', '--csv'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'stats', 'posts', '--limit', '0'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('uses human printers for email click, subscriber, and post drilldown reports', async () => {
    await expect(
      run(['node', 'ghst', 'stats', 'email', 'clicks', '--newsletter', 'newsletter-1']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'stats', 'email', 'subscribers'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'stats', 'post', 'post-1', 'growth'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'stats', 'post', 'post-1', 'referrers'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(statsMocks.printStatsNewsletterClicksHuman).toHaveBeenCalled();
    expect(statsMocks.printStatsNewsletterSubscribersHuman).toHaveBeenCalled();
    expect(statsMocks.printStatsPostGrowthHuman).toHaveBeenCalled();
    expect(statsMocks.printStatsPostReferrersHuman).toHaveBeenCalled();
  });

  test('validates that post drilldown views require a post id', async () => {
    await expect(run(['node', 'ghst', 'stats', 'post', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'stats', 'post', '', 'web'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'stats', 'post', '', 'growth'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'stats', 'post', '', 'newsletter'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'stats', 'post', '', 'referrers'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('prints subscriber summaries as json and rejects unknown email subviews', async () => {
    await expect(run(['node', 'ghst', '--json', 'stats', 'email', 'subscribers'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'stats', 'email', 'unknown-view'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );

    expect(statsMocks.printJson).toHaveBeenCalledWith(
      {
        newsletters: [
          {
            newsletter_id: 'newsletter-1',
            newsletter_name: 'Weekly',
            newsletter_slug: 'weekly',
            subscribers: 300,
            subscriber_delta: 10,
          },
        ],
      },
      undefined,
    );
  });

  test('allows csv clicks exports and validates subscriber filters', async () => {
    await expect(
      run(['node', 'ghst', 'stats', 'email', 'clicks', '--newsletter', 'newsletter-1', '--csv']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'stats', 'email', 'subscribers', '--newsletter', '']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
  });

  test('switches newsletter summaries between json and human output modes', async () => {
    await expect(run(['node', 'ghst', '--json', 'stats', 'email'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'stats', 'email'])).resolves.toBe(ExitCode.SUCCESS);

    expect(statsMocks.printJson).toHaveBeenCalledWith(
      {
        newsletters: [
          {
            newsletter_id: 'newsletter-1',
            newsletter_name: 'Weekly',
            newsletter_slug: 'weekly',
            sent_posts: 5,
            recipients: 100,
            open_rate: 55,
            click_rate: 22,
            subscribers: 300,
            subscriber_delta: 10,
          },
        ],
      },
      undefined,
    );
    expect(statsMocks.printStatsNewslettersHuman).toHaveBeenCalled();
  });

  test('prints posts summaries in human mode and validates growth limits', async () => {
    await expect(run(['node', 'ghst', 'stats', 'posts'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'stats', 'growth', '--limit', '0'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );

    expect(statsMocks.printStatsPostsHuman).toHaveBeenCalled();
  });
});
