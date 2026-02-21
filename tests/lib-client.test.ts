import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type GhostApiError, GhostClient } from '../src/lib/client.js';
import { ExitCode, type GhstError } from '../src/lib/errors.js';
import { cloneFixture, ghostFixtures } from './helpers/ghost-fixtures.js';
import {
  createGhostFixtureFetchHandler,
  installGhostFixtureFetchMock,
} from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

describe('GhostClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('requires at least one key in constructor', () => {
    expect(() => new GhostClient({ url: 'https://myblog.ghost.io' })).toThrowError(
      'Ghost client requires an admin key or content key.',
    );
  });

  test('normalizes url and defaults version in constructor', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(createGhostFixtureFetchHandler());

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
    installGhostFixtureFetchMock({
      onRequest: (request) => {
        urls.push(request.url.toString());
        return undefined;
      },
    });

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY, version: 'v6.0' });

    await client.posts.browse({ limit: 5, filter: 'status:draft', include: undefined });
    await client.posts.read('welcome', { bySlug: true, params: { include: 'tags,authors' } });
    await client.posts.add({ title: 'hello' }, 'html');
    await client.posts.edit('post-id', { title: 'edit' }, 'html');
    await client.posts.delete('post-id');

    await client.pages.browse({ limit: 2 });
    await client.pages.read('about', { bySlug: true });
    await client.pages.add({ title: 'page' }, 'html');
    await client.pages.edit('page-id', { title: 'page edit' }, 'html');
    await client.pages.delete('page-id');

    await client.tags.browse({ limit: 2 });
    await client.tags.read('news', { bySlug: true });
    await client.tags.add({ name: 'News' });
    await client.tags.edit('tag-id', { name: 'News 2' });
    await client.tags.delete('tag-id');

    await client.rawRequest('site/', 'get', { ok: true }, { a: 1 });

    expect(urls[0]).toContain('/ghost/api/admin/posts/?limit=5&filter=status%3Adraft');
    expect(urls[1]).toContain('/ghost/api/admin/posts/slug/welcome/?include=tags%2Cauthors');
    expect(urls[2]).toContain('/ghost/api/admin/posts/?source=html');
    expect(urls[3]).toContain('/ghost/api/admin/posts/post-id/?source=html');
    expect(urls[4]).toContain('/ghost/api/admin/posts/post-id/');

    expect(urls[5]).toContain('/ghost/api/admin/pages/?limit=2');
    expect(urls[6]).toContain('/ghost/api/admin/pages/slug/about/');
    expect(urls[7]).toContain('/ghost/api/admin/pages/?source=html');
    expect(urls[8]).toContain('/ghost/api/admin/pages/page-id/?source=html');
    expect(urls[9]).toContain('/ghost/api/admin/pages/page-id/');

    expect(urls[10]).toContain('/ghost/api/admin/tags/?limit=2');
    expect(urls[11]).toContain('/ghost/api/admin/tags/slug/news/');
    expect(urls[12]).toContain('/ghost/api/admin/tags/');
    expect(urls[13]).toContain('/ghost/api/admin/tags/tag-id/');
    expect(urls[14]).toContain('/ghost/api/admin/tags/tag-id/');

    expect(urls[15]).toContain('/ghost/api/admin/site/?a=1');
  });

  test('supports content API raw requests with content key', async () => {
    const urls: string[] = [];
    installGhostFixtureFetchMock({
      onRequest: (request) => {
        urls.push(request.url.toString());
        return undefined;
      },
    });

    const client = new GhostClient({
      url: 'https://myblog.ghost.io',
      key: KEY,
      contentKey: 'content-key',
    });

    await client.rawRequest('/posts/', 'GET', undefined, { limit: 1 }, { api: 'content' });
    expect(urls[0]).toContain('/ghost/api/content/posts/?limit=1&key=content-key');
  });

  test('returns empty object for 204 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });
    const result = await client.posts.delete('id-3');

    expect(result).toEqual({});
  });

  test('retries 429 with backoff attempts', async () => {
    let attempt = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) {
        return new Response(JSON.stringify({ errors: [{ message: 'rate limited' }] }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(cloneFixture(ghostFixtures.posts.browse)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });
    await client.posts.browse();
    expect(attempt).toBe(3);
  });

  test('retries read network failures once and does not retry writes', async () => {
    let count = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      count += 1;
      const method = String(init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && count === 1) {
        throw new Error('socket hang up');
      }

      if (method === 'POST') {
        throw new Error('socket hang up');
      }

      return new Response(JSON.stringify(cloneFixture(ghostFixtures.posts.browse)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });

    await client.posts.browse();
    await expect(client.posts.add({ title: 'no retry' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    } satisfies Partial<GhstError>);
    expect(count).toBe(3);
  });

  test('throws auth-required when key missing for selected API mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const adminless = new GhostClient({
      url: 'https://myblog.ghost.io',
      contentKey: 'content',
    });
    await expect(adminless.posts.browse()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      exitCode: ExitCode.AUTH_ERROR,
    } satisfies Partial<GhstError>);

    const contentless = new GhostClient({
      url: 'https://myblog.ghost.io',
      key: KEY,
    });
    await expect(
      contentless.rawRequest('/posts/', 'GET', undefined, undefined, { api: 'content' }),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      exitCode: ExitCode.AUTH_ERROR,
    } satisfies Partial<GhstError>);
  });

  test('throws GhostApiError with payload message when API fails with JSON', async () => {
    const validationFixture = ghostFixtures.posts.validation422 as Record<string, unknown>;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(cloneFixture((validationFixture.payload as Record<string, unknown>) ?? {})),
        {
          status: Number(validationFixture.status ?? 422),
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const client = new GhostClient({ url: 'https://myblog.ghost.io', key: KEY });

    await expect(client.posts.browse()).rejects.toMatchObject({
      message: String(validationFixture.message),
      status: Number(validationFixture.status ?? 422),
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
});
