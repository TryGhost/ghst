import { describe, expect, test, vi } from 'vitest';
import { getGlobalOptions } from '../src/lib/context.js';
import {
  ExitCode,
  formatErrorForJson,
  GhstError,
  mapHttpStatusToExitCode,
  normalizeError,
  printError,
} from '../src/lib/errors.js';
import {
  formatCsv,
  isJsonMode,
  printCommentHuman,
  printCommentLikesHuman,
  printCommentListHuman,
  printCommentReportsHuman,
  printCommentThreadHuman,
  printJson,
  printLabelHuman,
  printLabelListHuman,
  printMemberHuman,
  printMemberListHuman,
  printNewsletterHuman,
  printNewsletterListHuman,
  printOfferHuman,
  printOfferListHuman,
  printOperationStatsHuman,
  printPageHuman,
  printPageListHuman,
  printPostHuman,
  printPostListHuman,
  printTagHuman,
  printTagListHuman,
  printTierHuman,
  printTierListHuman,
} from '../src/lib/output.js';

describe('context helper', () => {
  test('extracts global options and applies env color overrides', () => {
    const previous = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';

    const commandLike = {
      optsWithGlobals: () => ({
        json: true,
        jq: '.posts[].title',
        site: 'myblog',
        url: 'https://example.com',
        staffToken: 'id:00',
        debug: 'api',
        color: true,
      }),
    };

    const globals = getGlobalOptions(commandLike as never);

    expect(globals).toEqual({
      json: true,
      jq: '.posts[].title',
      site: 'myblog',
      url: 'https://example.com',
      staffToken: 'id:00',
      debug: 'api',
      color: false,
    });

    if (previous === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previous;
    }
  });
});

describe('error helpers', () => {
  test('maps known http codes', () => {
    expect(mapHttpStatusToExitCode(401)).toBe(ExitCode.AUTH_ERROR);
    expect(mapHttpStatusToExitCode(403)).toBe(ExitCode.AUTH_ERROR);
    expect(mapHttpStatusToExitCode(404)).toBe(ExitCode.NOT_FOUND);
    expect(mapHttpStatusToExitCode(409)).toBe(ExitCode.CONFLICT);
    expect(mapHttpStatusToExitCode(422)).toBe(ExitCode.VALIDATION_ERROR);
    expect(mapHttpStatusToExitCode(429)).toBe(ExitCode.RATE_LIMITED);
    expect(mapHttpStatusToExitCode(500)).toBe(ExitCode.GENERAL_ERROR);
  });

  test('normalizes unknown and native errors', () => {
    const ghstError = new GhstError('already normalized');
    expect(normalizeError(ghstError)).toBe(ghstError);

    const native = normalizeError(new Error('boom'));
    expect(native).toMatchObject({
      message: 'boom',
      code: 'UNHANDLED_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });

    const unknown = normalizeError({ reason: 'boom' });
    expect(unknown).toMatchObject({
      message: 'Unknown error',
      code: 'UNKNOWN_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  });

  test('formats and prints errors in json and human mode', () => {
    const error = new GhstError('Failed', {
      code: 'E_FAIL',
      status: 409,
      details: { errors: [{ context: 'stale updated_at' }] },
      exitCode: ExitCode.CONFLICT,
    });

    expect(formatErrorForJson(error)).toEqual({
      error: true,
      code: 'E_FAIL',
      status: 409,
      message: 'Failed',
      context: 'stale updated_at',
      details: { errors: [{ context: 'stale updated_at' }] },
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    printError(error, { json: true });
    printError(error, { json: false });
    printError(new GhstError('No status'), { json: false });

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('output helpers', () => {
  test('prints json and jq-filtered json', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    printJson({ posts: [{ title: 'a' }, { title: 'b' }] }, '.posts[].title');
    printJson([{ title: 'a' }, { title: 'b' }], '.[].title');
    printJson({ ok: true }, '.ok');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('throws on unsupported jq syntax', () => {
    expect(() => printJson({ posts: [] }, 'bad-filter')).toThrowError('Unsupported --jq filter');
  });

  test('prints human list/details for resources', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const previousForceTty = process.env.GHST_FORCE_TTY;
    process.env.GHST_FORCE_TTY = '1';

    printPostListHuman(
      {
        posts: [{ id: '1', title: 'A', status: 'published', published_at: '2026-01-01' }],
        meta: { pagination: { page: 1, pages: 1, total: 1 } },
      },
      true,
    );
    printPageListHuman({ pages: [{ id: '2', title: 'B', status: 'draft', published_at: '' }] });
    printTagListHuman({ tags: [{ id: '3', name: 'Tag', slug: 'tag', visibility: 'public' }] });
    printMemberListHuman({
      members: [{ id: '4', email: 'x@example.com', name: 'X', status: 'free', updated_at: '' }],
    });
    printNewsletterListHuman({
      newsletters: [
        { id: '5', name: 'Newsletter', slug: 'news', status: 'active', visibility: 'members' },
      ],
    });
    printTierListHuman({
      tiers: [{ id: '6', name: 'Tier', type: 'paid', active: true, monthly_price: 500 }],
    });
    printOfferListHuman({
      offers: [{ id: '7', name: 'Offer', code: 'offer', status: 'active', type: 'percent' }],
    });
    printLabelListHuman({
      labels: [{ id: '8', name: 'Label', slug: 'label', updated_at: '2026-01-01' }],
    });
    printCommentListHuman({
      comments: [
        {
          id: 'comment-1',
          status: 'published',
          created_at: '2026-01-01',
          html: '<p>Hello</p>',
          member: { id: 'member-1', name: 'Member' },
          post: { id: 'post-1', title: 'Post title' },
          count: { replies: 2, direct_replies: 1, likes: 3, reports: 0 },
        },
      ],
      meta: { pagination: { page: 1, pages: 1, total: 1 } },
    });
    printCommentLikesHuman({
      comment_likes: [
        {
          id: 'like-1',
          member: { id: 'member-1', name: 'Member', email: 'member@example.com' },
          created_at: '2026-01-01',
        },
      ],
    });
    printCommentReportsHuman({
      comment_reports: [
        {
          id: 'report-1',
          member: { id: 'member-1', name: 'Member', email: 'member@example.com' },
          created_at: '2026-01-01',
        },
      ],
    });

    printPostHuman({ posts: [{ id: 'id1', title: 'Title', slug: 'slug', status: 'draft' }] });
    printPageHuman({ pages: [{ id: 'id2', title: 'Page', slug: 'about', status: 'draft' }] });
    printTagHuman({ tags: [{ id: 'id3', name: 'Tag', slug: 'tag', visibility: 'public' }] });
    printMemberHuman({
      members: [{ id: 'id4', email: 'x@example.com', name: 'X', status: 'free', updated_at: '' }],
    });
    printNewsletterHuman({
      newsletters: [{ id: 'id5', name: 'News', slug: 'news', status: 'active' }],
    });
    printTierHuman({ tiers: [{ id: 'id6', name: 'Tier', type: 'paid' }] });
    printOfferHuman({ offers: [{ id: 'id7', name: 'Offer', code: 'offer', status: 'active' }] });
    printLabelHuman({ labels: [{ id: 'id8', name: 'Label', slug: 'label' }] });
    printCommentHuman({
      comments: [
        {
          id: 'comment-1',
          status: 'published',
          created_at: '2026-01-01',
          edited_at: '2026-01-02',
          html: '<p>Hello</p>',
          member: { id: 'member-1', name: 'Member' },
          post: { id: 'post-1', title: 'Post title' },
          count: { replies: 2, direct_replies: 1, likes: 3, reports: 0 },
        },
      ],
    });
    printCommentThreadHuman({
      comment: {
        id: 'comment-1',
        status: 'published',
        created_at: '2026-01-01',
        edited_at: '2026-01-02',
        html: '<p>Hello</p>',
        member: { id: 'member-1', name: 'Member' },
        post: { id: 'post-1', title: 'Post title' },
        count: { replies: 2, direct_replies: 1, likes: 3, reports: 0 },
      },
      comments: [
        {
          id: 'comment-2',
          status: 'published',
          created_at: '2026-01-03',
          html: '<p>Reply</p>',
          member: { id: 'member-1', name: 'Member' },
          post: { id: 'post-1', title: 'Post title' },
          count: { replies: 0, direct_replies: 0, likes: 0, reports: 0 },
          in_reply_to_snippet: 'Hello',
        },
      ],
      meta: { pagination: { page: 1, pages: 1, total: 1 } },
    });
    printPostHuman({ posts: [] });
    printCommentThreadHuman({ comment: null, comments: [] });
    printOperationStatsHuman({ meta: { stats: { imported: 2, invalid: [] } } }, 'Imported members');
    printOperationStatsHuman(
      { bulk: { meta: { stats: { successful: 2, unsuccessful: 1 } } } },
      'Bulk operation',
    );

    if (previousForceTty === undefined) {
      delete process.env.GHST_FORCE_TTY;
    } else {
      process.env.GHST_FORCE_TTY = previousForceTty;
    }

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('detects json mode from flag and environment', () => {
    expect(isJsonMode({ json: true })).toBe(true);
    expect(isJsonMode({ json: false })).toBe(false);
    expect(isJsonMode({ jq: '.posts[].title' })).toBe(true);

    const previous = process.env.GHST_OUTPUT;
    process.env.GHST_OUTPUT = 'json';
    expect(isJsonMode({})).toBe(true);
    if (previous === undefined) {
      delete process.env.GHST_OUTPUT;
    } else {
      process.env.GHST_OUTPUT = previous;
    }
  });

  test('quotes csv fields containing carriage returns', () => {
    expect(formatCsv(['title'], [['hello\rworld']])).toBe('title\n"hello\rworld"');
  });
});
