import { afterEach, describe, expect, test, vi } from 'vitest';
import { collectAllPages } from '../src/lib/pagination.js';
import { parseBooleanFlag, parseCsv, parseInteger, parseQueryPairs } from '../src/lib/parse.js';
import { ask, confirm, setPromptHandlerForTests } from '../src/lib/prompts.js';
import { servesGhostAdminApi } from '../src/lib/site.js';
import { isForcedTty, isNonInteractive, isStdinTty, isStdoutTty } from '../src/lib/tty.js';

describe('parse helpers', () => {
  test('parses csv and query pairs', () => {
    expect(parseCsv('a,b, c')).toEqual(['a', 'b', 'c']);
    expect(parseCsv('')).toBeUndefined();
    expect(parseQueryPairs(['a=1', 'b=two=three'])).toEqual({ a: '1', b: 'two=three' });
    expect(parseQueryPairs(undefined)).toEqual({});
    expect(() => parseQueryPairs(['=missing'])).toThrowError('Invalid query pair');
  });

  test('parses booleans and integers', () => {
    expect(parseBooleanFlag(true)).toBe(true);
    expect(parseBooleanFlag('yes')).toBe(true);
    expect(parseBooleanFlag('0')).toBe(false);
    expect(parseBooleanFlag(undefined)).toBeUndefined();
    expect(() => parseBooleanFlag('maybe')).toThrowError('Invalid boolean value');

    expect(parseInteger('10', 'limit')).toBe(10);
    expect(parseInteger(undefined, 'limit')).toBeUndefined();
    expect(() => parseInteger('x', 'limit')).toThrowError('limit must be an integer');
  });
});

describe('prompt helpers', () => {
  test('delegates ask/confirm to test handler', async () => {
    const values = ['hello', 'yes', 'no'];
    setPromptHandlerForTests(async () => values.shift() ?? '');

    await expect(ask('Question?')).resolves.toBe('hello');
    await expect(confirm('Confirm?')).resolves.toBe(true);
    await expect(confirm('Confirm?')).resolves.toBe(false);

    setPromptHandlerForTests(null);
  });
});

describe('tty helpers', () => {
  test('resolves forced tty and non-interactive mode', () => {
    expect(isForcedTty({ GHST_FORCE_TTY: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isStdinTty({ GHST_FORCE_TTY: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isStdoutTty({ GHST_FORCE_TTY: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isNonInteractive({ GHST_FORCE_TTY: '1' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('pagination helpers', () => {
  test('collects all paginated pages', async () => {
    const payload = await collectAllPages('posts', async (page) => {
      if (page === 1) {
        return {
          posts: [{ id: 1 }],
          meta: { pagination: { page: 1, pages: 2, total: 2, next: 2 } },
        };
      }

      return {
        posts: [{ id: 2 }],
        meta: { pagination: { page: 2, pages: 2, total: 2, next: null } },
      };
    });

    expect(payload.posts).toEqual([{ id: 1 }, { id: 2 }]);
    expect((payload.meta as Record<string, unknown>).pagination).toMatchObject({
      pages: 1,
      total: 2,
      next: null,
    });
  });
});

describe('Ghost Admin API probe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respondWith = (response: Response) => {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  test('accepts only a JSON site payload from the site endpoint', async () => {
    const fetchMock = respondWith(Response.json({ site: { title: 'Blog' } }));
    await expect(servesGhostAdminApi('https://john.ghost.io')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://john.ghost.io/ghost/api/admin/site/',
      expect.objectContaining({ redirect: 'manual' }),
    );

    respondWith(Response.json({ title: 'Not Ghost' }));
    await expect(servesGhostAdminApi('https://example.com')).resolves.toBe(false);

    respondWith(new Response('<html>Sign in</html>', { status: 200 }));
    await expect(servesGhostAdminApi('https://example.cloudflareaccess.com')).resolves.toBe(false);

    respondWith(new Response(null, { status: 302, headers: { location: '/login' } }));
    await expect(servesGhostAdminApi('https://example.cloudflareaccess.com')).resolves.toBe(false);
  });

  test('reports a body read failure as a network error, not a non-Ghost origin', async () => {
    const failingBody = new ReadableStream({
      start(controller) {
        controller.error(new Error('socket hang up'));
      },
    });
    respondWith(new Response(failingBody, { status: 200 }));

    await expect(servesGhostAdminApi('https://john.ghost.io')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: expect.stringContaining('socket hang up'),
    });
  });
});
