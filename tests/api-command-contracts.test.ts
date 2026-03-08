import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';

const apiMocks = vi.hoisted(() => ({
  resolveConnectionConfig: vi.fn(),
  rawRequestWithMeta: vi.fn(),
  printJson: vi.fn(),
}));

vi.mock('../src/lib/config.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/config.js')>('../src/lib/config.js');
  return {
    ...actual,
    resolveConnectionConfig: (...args: unknown[]) => apiMocks.resolveConnectionConfig(...args),
  };
});

vi.mock('../src/lib/client.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/client.js')>('../src/lib/client.js');
  class GhostClientMock {
    rawRequestWithMeta(...args: unknown[]) {
      return apiMocks.rawRequestWithMeta(...args);
    }
  }
  return {
    ...actual,
    GhostClient: GhostClientMock,
  };
});

vi.mock('../src/lib/output.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/output.js')>('../src/lib/output.js');
  return {
    ...actual,
    printJson: (...args: unknown[]) => apiMocks.printJson(...args),
  };
});

import { run } from '../src/index.js';

describe('api command contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.resolveConnectionConfig.mockResolvedValue({
      url: 'https://demo.example.com',
      staffToken: 'token',
      apiVersion: 'v6.0',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('merges inline JSON, parsed fields, and paginated collection responses', async () => {
    apiMocks.rawRequestWithMeta
      .mockResolvedValueOnce({
        status: 200,
        headers: { 'x-page': '1' },
        data: {
          posts: [{ id: '1' }],
          meta: { pagination: { page: 1, pages: 2 } },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: { 'x-page': '2' },
        data: {
          posts: [{ id: '2' }],
          meta: { pagination: { page: 2, pages: 2 } },
        },
      });

    await expect(
      run([
        'node',
        'ghst',
        'api',
        '/posts/',
        '--method',
        'POST',
        '--body',
        '{"title":"Hello"}',
        '--field',
        'published=true',
        '--field',
        'rating=4',
        '--field',
        'note=null',
        '--paginate',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(apiMocks.rawRequestWithMeta).toHaveBeenNthCalledWith(
      1,
      '/posts/',
      'POST',
      {
        title: 'Hello',
        published: true,
        rating: 4,
        note: null,
      },
      { page: 1 },
      { api: 'admin' },
    );
    expect(apiMocks.printJson).toHaveBeenCalledWith(
      {
        posts: [{ id: '1' }, { id: '2' }],
        meta: {
          pagination: {
            page: 1,
            pages: 1,
            next: null,
            prev: null,
            total: 2,
            limit: 2,
          },
        },
      },
      undefined,
    );
  });

  test('uses field pairs as the request body and can include response headers in output', async () => {
    apiMocks.rawRequestWithMeta.mockResolvedValue({
      status: 200,
      headers: { etag: 'abc' },
      data: { site: { title: 'Demo' } },
    });

    await expect(
      run(['node', 'ghst', 'api', '/site/', '--field', 'enabled=false', '--include-headers']),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(apiMocks.rawRequestWithMeta).toHaveBeenCalledWith(
      '/site/',
      'GET',
      { enabled: false },
      {},
      { api: 'admin' },
    );
    expect(apiMocks.printJson).toHaveBeenCalledWith(
      {
        status: 200,
        headers: { etag: 'abc' },
        data: { site: { title: 'Demo' } },
      },
      undefined,
    );
  });

  test('stops pagination when the payload does not expose a collection key', async () => {
    apiMocks.rawRequestWithMeta.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        site: { title: 'Demo' },
        meta: { pagination: { page: 1, pages: 3 } },
      },
    });

    await expect(run(['node', 'ghst', 'api', '/site/', '--paginate'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(apiMocks.rawRequestWithMeta).toHaveBeenCalledTimes(1);
    expect(apiMocks.printJson).toHaveBeenCalledWith(
      {
        site: { title: 'Demo' },
        meta: { pagination: { page: 1, pages: 3 } },
      },
      undefined,
    );
  });
});
