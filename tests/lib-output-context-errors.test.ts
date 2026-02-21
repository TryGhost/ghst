import { describe, expect, test, vi } from 'vitest';
import { getGlobalOptions } from '../src/lib/context.js';
import {
  ExitCode,
  GhstError,
  formatErrorForJson,
  mapHttpStatusToExitCode,
  normalizeError,
  printError,
} from '../src/lib/errors.js';
import {
  isJsonMode,
  printJson,
  printPostHuman,
  printPostListHuman,
} from '../src/lib/output.js';

describe('context helper', () => {
  test('extracts global options from commander-like object', () => {
    const commandLike = {
      optsWithGlobals: () => ({
        json: true,
        jq: '.posts[].title',
        site: 'myblog',
        url: 'https://example.com',
        key: 'id:00',
        debug: 'api',
        color: false,
      }),
    };

    const globals = getGlobalOptions(commandLike as never);

    expect(globals).toEqual({
      json: true,
      jq: '.posts[].title',
      site: 'myblog',
      url: 'https://example.com',
      key: 'id:00',
      debug: 'api',
      color: false,
    });
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
      status: 422,
      details: { field: 'title' },
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    expect(formatErrorForJson(error)).toEqual({
      error: true,
      code: 'E_FAIL',
      status: 422,
      message: 'Failed',
      details: { field: 'title' },
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
    printJson({ posts: { title: 'single' } }, '.posts[].title');
    printJson({ ok: true });

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('throws on unsupported jq syntax', () => {
    expect(() => printJson({ posts: [] }, 'bad-filter')).toThrowError('Unsupported --jq filter');
  });

  test('prints human post list and post details', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    printPostListHuman(
      {
        posts: [
          { id: '1', title: 'A', status: 'published', published_at: '2026-01-01' },
          { id: '2', title: 'B', status: 'draft', published_at: '2026-01-02' },
          { id: '3', title: 'C', status: 'scheduled', published_at: '2026-01-03' },
          { id: '4', title: 'D', status: 'other', published_at: '2026-01-04' },
        ],
        meta: { pagination: { page: 1, pages: 2, total: 4 } },
      },
      false,
    );

    printPostHuman({ posts: [{ id: 'id1', title: 'Title', slug: 'slug', status: 'draft' }] });
    printPostHuman({ posts: [] });
    printPostListHuman(
      {
        posts: [
          { id: '5', title: 'E', status: 'draft', published_at: '' },
          { id: '6', title: 'F', status: 'scheduled', published_at: '' },
        ],
      },
      true,
    );
    printPostListHuman(
      {
        posts: [{ published_at: '2026-01-01' }],
        meta: { pagination: {} },
      },
      true,
    );
    printPostListHuman({ posts: {} }, true);

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('handles non-array and missing-field human payloads', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    printPostHuman({ posts: {} });
    printPostHuman({ posts: [{}] });

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('detects json mode from flag and environment', () => {
    expect(isJsonMode({ json: true })).toBe(true);
    expect(isJsonMode({ json: false })).toBe(false);

    const previous = process.env.GHST_OUTPUT;
    process.env.GHST_OUTPUT = 'json';
    expect(isJsonMode({})).toBe(true);
    if (previous === undefined) {
      delete process.env.GHST_OUTPUT;
    } else {
      process.env.GHST_OUTPUT = previous;
    }
  });
});
