import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode, GhstError } from '../src/lib/errors.js';
import { GhostApiError, GhostClient } from '../src/lib/client.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

describe('GhostClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes url and defaults version in constructor', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ site: [{ title: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new GhostClient({
      url: 'https://myblog.ghost.io/',
      key: KEY,
    });

    await client.siteInfo();

    const [urlArg, initArg] = fetchSpy.mock.calls[0] ?? [];
    expect(String(urlArg)).toBe('https://myblog.ghost.io/ghost/api/admin/site/');
    const init = initArg as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Accept-Version']).toBe('v6.0');
  });

  test('passes params and source query on request wrappers', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ posts: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY, version: 'v6.0' });

    await client.posts.browse({ limit: 5, filter: 'status:draft', include: undefined });
    await client.posts.read('welcome', {
      bySlug: true,
      params: { include: 'tags,authors' },
    });
    await client.posts.add({ title: 'hello' }, 'html');
    await client.posts.edit('id-1', { title: 'edit' }, 'html');
    await client.posts.delete('id-2');
    await client.pages.browse();
    await client.pages.read('page-1');
    await client.tags.browse();
    await client.tags.read('tag-1');
    await client.rawRequest('site/', 'get', { ok: true }, { a: 1 });

    expect(urls[0]).toContain('/ghost/api/admin/posts/?limit=5&filter=status%3Adraft');
    expect(urls[1]).toContain('/ghost/api/admin/posts/slug/welcome/?include=tags%2Cauthors');
    expect(urls[2]).toContain('/ghost/api/admin/posts/?source=html');
    expect(urls[3]).toContain('/ghost/api/admin/posts/id-1/?source=html');
    expect(urls[4]).toContain('/ghost/api/admin/posts/id-2/');
    expect(urls[5]).toContain('/ghost/api/admin/pages/');
    expect(urls[6]).toContain('/ghost/api/admin/pages/page-1/');
    expect(urls[7]).toContain('/ghost/api/admin/tags/');
    expect(urls[8]).toContain('/ghost/api/admin/tags/tag-1/');
    expect(urls[9]).toContain('/ghost/api/admin/site/?a=1');
  });

  test('returns empty object for 204 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });
    const result = await client.posts.delete('id-3');

    expect(result).toEqual({});
  });

  test('throws GhostApiError with payload message when API fails with JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [{ message: 'invalid post' }],
        }),
        {
          status: 422,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });

    await expect(client.posts.browse()).rejects.toMatchObject({
      message: 'invalid post',
      status: 422,
      exitCode: ExitCode.VALIDATION_ERROR,
    } satisfies Partial<GhostApiError>);
  });

  test('throws GhostApiError with fallback message when API body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>oops</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });

    await expect(client.posts.browse()).rejects.toMatchObject({
      message: 'Ghost API request failed (500)',
      status: 500,
      exitCode: ExitCode.GENERAL_ERROR,
    } satisfies Partial<GhostApiError>);
  });

  test('throws GhstError on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });

    await expect(client.posts.browse()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    } satisfies Partial<GhstError>);
  });
});
