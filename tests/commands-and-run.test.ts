import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setPromptForTests } from '../src/commands/auth.js';
import { ExitCode } from '../src/lib/errors.js';
import { run } from '../src/index.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('run + commands', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;
  let previousApiVersion: string | undefined;
  let previousSite: string | undefined;
  let previousOutput: string | undefined;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;
    previousApiVersion = process.env.GHOST_API_VERSION;
    previousSite = process.env.GHOST_SITE;
    previousOutput = process.env.GHST_OUTPUT;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-run-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    process.env.GHOST_API_VERSION = 'v6.0';
    delete process.env.GHOST_SITE;
    delete process.env.GHST_OUTPUT;

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? 'GET').toUpperCase();
      const pathname = url.pathname;

      if (pathname.endsWith('/ghost/api/admin/site/')) {
        return jsonResponse({ site: [{ title: 'My Ghost Site' }] });
      }

      if (pathname.endsWith('/ghost/api/admin/posts/') && method === 'GET') {
        return jsonResponse({
          posts: [{ id: 'post-id', title: 'Welcome', slug: 'welcome', status: 'published' }],
          meta: { pagination: { page: 1, pages: 1, total: 1 } },
        });
      }

      if (pathname.endsWith('/ghost/api/admin/posts/post-id/') && method === 'GET') {
        return jsonResponse({
          posts: [{ id: 'post-id', title: 'Welcome', slug: 'welcome', status: 'published' }],
        });
      }

      if (pathname.endsWith('/ghost/api/admin/posts/slug/welcome/') && method === 'GET') {
        return jsonResponse({
          posts: [{ id: 'post-id', title: 'Welcome', slug: 'welcome', status: 'published' }],
        });
      }

      return jsonResponse({ errors: [{ message: `Unhandled route: ${pathname}` }] }, 404);
    });
  });

  afterEach(async () => {
    setPromptForTests(null);
    vi.restoreAllMocks();
    process.chdir(previousCwd);

    if (previousConfigDir === undefined) {
      delete process.env.GHST_CONFIG_DIR;
    } else {
      process.env.GHST_CONFIG_DIR = previousConfigDir;
    }

    if (previousApiVersion === undefined) {
      delete process.env.GHOST_API_VERSION;
    } else {
      process.env.GHOST_API_VERSION = previousApiVersion;
    }

    if (previousSite === undefined) {
      delete process.env.GHOST_SITE;
    } else {
      process.env.GHOST_SITE = previousSite;
    }

    if (previousOutput === undefined) {
      delete process.env.GHST_OUTPUT;
    } else {
      process.env.GHST_OUTPUT = previousOutput;
    }
  });

  test('handles help and unknown command paths', async () => {
    await expect(run(['node', 'ghst', '--help'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'nope'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('covers auth flows including interactive switch branch', async () => {
    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);

    process.env.MY_GHOST_KEY = KEY;
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--url',
        'https://myblog.ghost.io',
        '--key-env',
        'MY_GHOST_KEY',
        '--site',
        'myblog',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'status', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    const storedConfig = JSON.parse(
      await fs.readFile(path.join(configDir, 'config.json'), 'utf8'),
    ) as Record<string, unknown>;
    delete storedConfig.active;
    await fs.writeFile(path.join(configDir, 'config.json'), `${JSON.stringify(storedConfig, null, 2)}\n`);
    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);
    delete process.env.GHOST_API_VERSION;
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--url',
        'https://secondary.ghost.io',
        '--key',
        KEY,
        '--site',
        'secondary',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    process.env.GHOST_API_VERSION = 'v6.0';
    await expect(run(['node', 'ghst', 'auth', 'switch', 'myblog'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'switch', 'missing'])).resolves.toBe(ExitCode.NOT_FOUND);

    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.USAGE_ERROR);

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setPromptForTests(async () => 'myblog');
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.SUCCESS);
    setPromptForTests(async () => undefined as unknown as string);
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.NOT_FOUND);

    if (ttyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
    }

    await expect(run(['node', 'ghst', 'auth', 'link'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'token'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'logout', '--site', 'missing'])).resolves.toBe(
      ExitCode.NOT_FOUND,
    );
    await expect(run(['node', 'ghst', 'auth', 'logout', '--site', 'secondary'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'auth', 'logout', '--site', 'myblog'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'auth', 'logout'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'status', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'link'])).resolves.toBe(ExitCode.AUTH_ERROR);
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.AUTH_ERROR);

    const promptAnswers = ['https://prompted.ghost.io', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');
    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);

    delete process.env.MY_GHOST_KEY;
  });

  test('covers post, api, config, completion, and stubs', async () => {
    await expect(run(['node', 'ghst', 'config', 'show'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--url',
        'https://myblog.ghost.io',
        '--key',
        KEY,
        '--site',
        'myblog',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'post', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'list', '--page', '2'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'post', 'list', '--json', '--jq', '.posts[].title']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'list', '--limit', '0'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );

    await expect(run(['node', 'ghst', 'post', 'get', 'post-id'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'get', '--slug', 'welcome'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'post', 'get', 'post-id', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'post', 'get', ''])).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', 'post', 'get'])).resolves.toBe(ExitCode.USAGE_ERROR);

    await expect(run(['node', 'ghst', 'api'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'api',
        '/posts/',
        '--method',
        'GET',
        '--query',
        'limit=1',
        'status=published',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'api', '/site/'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'api',
        '/posts/',
        '--method',
        'POST',
        '--body',
        '{"posts":[{"title":"New"}]}',
      ]),
    ).resolves.toBe(ExitCode.NOT_FOUND);

    await expect(run(['node', 'ghst', 'config', 'show'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'config', 'show', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'post', 'create'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'post', 'update'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'post', 'delete'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'post', 'publish'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'page', 'list'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'tag', 'list'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('uses env output mode for json errors', async () => {
    process.env.GHST_OUTPUT = 'json';
    await expect(run(['node', 'ghst', 'api'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });
});
