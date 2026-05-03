import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setOpenUrlForTests, setPromptForTests } from '../src/commands/auth.js';
import { setMcpRunnersForTests } from '../src/commands/mcp.js';
import { setThemeDevRunnerForTests, setThemeValidatorForTests } from '../src/commands/theme.js';
import { setWebhookListenRunnerForTests } from '../src/commands/webhook.js';
import { run } from '../src/index.js';
import { setCredentialStoreForTests } from '../src/lib/credentials.js';
import { ExitCode } from '../src/lib/errors.js';
import { setMigrateSourceLoaderForTests } from '../src/lib/migrate.js';
import { setPromptHandlerForTests } from '../src/lib/prompts.js';
import { resetSocialWebIdentityCacheForTests } from '../src/lib/socialweb-client.js';
import { fixtureIds, ghostFixtures } from './helpers/ghost-fixtures.js';
import { createMemoryCredentialStore } from './helpers/mock-credentials.js';
import {
  createGhostFixtureFetchHandler,
  installGhostFixtureFetchMock,
} from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';
const fixturePrimaryPostTitle =
  (ghostFixtures.posts.read as { posts?: Array<{ title?: string }> }).posts?.[0]?.title ??
  'Fixture Post';

describe('run + commands', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;
  let previousApiVersion: string | undefined;
  let previousSite: string | undefined;
  let previousOutput: string | undefined;
  let previousContentKey: string | undefined;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;
    previousApiVersion = process.env.GHOST_API_VERSION;
    previousSite = process.env.GHOST_SITE;
    previousOutput = process.env.GHST_OUTPUT;
    previousContentKey = process.env.GHOST_CONTENT_API_KEY;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-run-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    process.env.GHOST_API_VERSION = 'v6.0';
    process.env.GHOST_CONTENT_API_KEY = 'content-key';
    delete process.env.GHOST_SITE;
    delete process.env.GHST_OUTPUT;
    delete process.env.GHST_MCP_AUTH_TOKEN;
    setCredentialStoreForTests(createMemoryCredentialStore());
    resetSocialWebIdentityCacheForTests();

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    installGhostFixtureFetchMock({ postConflictOnce: true });
  });

  afterEach(async () => {
    setPromptForTests(null);
    setOpenUrlForTests(null);
    setPromptHandlerForTests(null);
    setMcpRunnersForTests(null);
    setThemeDevRunnerForTests(null);
    setThemeValidatorForTests(null);
    setWebhookListenRunnerForTests(null);
    setMigrateSourceLoaderForTests(null);
    setCredentialStoreForTests(null);
    resetSocialWebIdentityCacheForTests();
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

    if (previousContentKey === undefined) {
      delete process.env.GHOST_CONTENT_API_KEY;
    } else {
      process.env.GHOST_CONTENT_API_KEY = previousContentKey;
    }
  });

  async function loginMyblog(site = 'myblog'): Promise<void> {
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        '--site',
        site,
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
  }

  async function seedSmokeFixtures(): Promise<void> {
    await fs.writeFile(path.join(workDir, 'post.html'), '<p>Hello</p>', 'utf8');
    await fs.writeFile(path.join(workDir, 'post.lexical.json'), '{"root":{}}', 'utf8');
    await fs.writeFile(path.join(workDir, 'post.md'), '# Hello\n\nMarkdown body', 'utf8');
    await fs.writeFile(path.join(workDir, 'post-raw.html'), '<section>Raw HTML</section>', 'utf8');
    await fs.writeFile(
      path.join(workDir, 'post-from.json'),
      '{"posts":[{"title":"From JSON"}]}',
      'utf8',
    );
    await fs.writeFile(path.join(workDir, 'payload.json'), '{"posts":[{"title":"raw"}]}', 'utf8');
    await fs.writeFile(path.join(workDir, 'members.csv'), 'email\nx@example.com\n', 'utf8');
    await fs.writeFile(path.join(workDir, 'photo.jpg'), 'fake-image', 'utf8');
    await fs.writeFile(path.join(workDir, 'theme.zip'), 'fake-zip', 'utf8');
    await fs.writeFile(path.join(workDir, 'import.json'), '{"db":[{"meta":{},"data":{}}]}', 'utf8');
    await fs.writeFile(
      path.join(workDir, 'migrate.csv'),
      'title,html\nImported Post,<p>Hello</p>\n',
      'utf8',
    );

    const themeDir = path.join(workDir, 'theme-dev');
    await fs.mkdir(themeDir, { recursive: true });
    await fs.writeFile(path.join(themeDir, 'package.json'), '{"name":"theme-dev"}', 'utf8');
  }

  function logOutputSince(start: number): string {
    return vi
      .mocked(console.log)
      .mock.calls.slice(start)
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
  }

  function lastLogJson<T>(): T {
    return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? 'null')) as T;
  }

  test('handles help and unknown command paths', async () => {
    await expect(run(['node', 'ghst', '--help'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'nope'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('completion output includes full command surface and global flags', async () => {
    const logSpy = vi.spyOn(console, 'log');
    await expect(run(['node', 'ghst', 'completion', 'bash'])).resolves.toBe(ExitCode.SUCCESS);

    const script = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(script).toContain('comment');
    expect(script).toContain('newsletter');
    expect(script).toContain('mcp');
    expect(script).toContain('--debug');
    expect(script).toContain('--no-color');
  });

  test('runs auth flows including non-interactive login and interactive switching', async () => {
    const openedUrls: string[] = [];
    setOpenUrlForTests(async (url) => {
      openedUrls.push(url);
    });

    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);

    process.env.MY_GHOST_KEY = KEY;
    await expect(run(['node', 'ghst', 'auth', 'login', '--json'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token-env',
        'MY_GHOST_KEY',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'switch', 'myblog'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'status', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'switch', 'missing'])).resolves.toBe(
      ExitCode.NOT_FOUND,
    );

    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.USAGE_ERROR);

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setPromptForTests(async () => 'myblog');
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.SUCCESS);

    if (ttyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
    }

    await expect(run(['node', 'ghst', 'auth', 'link'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'token'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'logout'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'auth', 'logout', '--site', 'myblog'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'auth', 'logout', '--yes'])).resolves.toBe(ExitCode.SUCCESS);

    const promptAnswers = ['https://prompted.ghost.io', '', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');
    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);
    expect(openedUrls).toEqual(['https://prompted.ghost.io/ghost/#/settings/staff']);

    delete process.env.MY_GHOST_KEY;
  });

  test('shows project link in auth list while leaving auth status unchanged', async () => {
    const logSpy = vi.mocked(console.log);

    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://project.ghost.io',
        '--staff-token',
        KEY,
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://active.ghost.io',
        '--staff-token',
        KEY,
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await fs.mkdir(path.join(workDir, '.ghst'), { recursive: true });
    await fs.writeFile(
      path.join(workDir, '.ghst', 'config.json'),
      `${JSON.stringify({ site: 'project' }, null, 2)}\n`,
      'utf8',
    );

    let start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);
    const statusOutput = logSpy.mock.calls
      .slice(start)
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(statusOutput).toContain('Active site: active.ghost.io');
    expect(statusOutput).toContain('* active.ghost.io');
    expect(statusOutput).not.toContain('Project link:');
    expect(statusOutput).not.toContain('* project.ghost.io');

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'status', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    const statusJson = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '')) as {
      active: string | null;
      sites: string[];
      projectLink?: string;
      effectiveSite?: string | null;
    };
    expect(statusJson).toEqual({
      active: 'active',
      sites: ['project', 'active'],
    });
    expect(logSpy.mock.calls.length).toBe(start + 1);

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    const listOutput = logSpy.mock.calls
      .slice(start)
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(listOutput).toContain('Active site: active.ghost.io');
    expect(listOutput).toContain(
      'Project link: project.ghost.io (overrides active site in this directory)',
    );
    expect(listOutput).toContain('  active.ghost.io');
    expect(listOutput).toContain('* project.ghost.io');

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    const listJson = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '')) as {
      active: string | null;
      projectLink?: string;
      effectiveSite: string | null;
      sites: string[];
    };
    expect(listJson).toEqual({
      active: 'active',
      projectLink: 'project',
      effectiveSite: 'project',
      sites: ['project', 'active'],
    });
    expect(logSpy.mock.calls.length).toBe(start + 1);
  });

  test('refuses to overwrite project links and explicit output files', async () => {
    await loginMyblog();
    await seedSmokeFixtures();

    await fs.mkdir(path.join(workDir, '.ghst'), { recursive: true });
    await fs.writeFile(
      path.join(workDir, '.ghst', 'config.json'),
      '{"site":"existing","defaults":{"format":"json"}}',
      'utf8',
    );
    await expect(run(['node', 'ghst', 'auth', 'link'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'auth', 'link', '--yes'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      fs.readFile(path.join(workDir, '.ghst', 'config.json'), 'utf8'),
    ).resolves.toContain('"site": "myblog"');
    await expect(
      fs.readFile(path.join(workDir, '.ghst', 'config.json'), 'utf8'),
    ).resolves.toContain('"format": "json"');
    await fs.rm(path.join(workDir, '.ghst'), { recursive: true, force: true });

    await fs.writeFile(path.join(workDir, 'members-export.csv'), 'existing\n', 'utf8');
    await expect(
      run(['node', 'ghst', 'member', 'export', '--output', './members-export.csv']),
    ).resolves.toBe(ExitCode.USAGE_ERROR);

    await fs.writeFile(path.join(workDir, 'posts.csv'), 'existing\n', 'utf8');
    await expect(
      run(['node', 'ghst', 'stats', 'posts', '--csv', '--output', './posts.csv']),
    ).resolves.toBe(ExitCode.USAGE_ERROR);

    await fs.writeFile(path.join(workDir, 'export.zip'), 'existing\n', 'utf8');
    await expect(
      run(['node', 'ghst', 'migrate', 'export', '--output', './export.zip', '--json']),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('updates the discovered project link instead of creating a nested one from a subdirectory', async () => {
    await loginMyblog();
    await fs.mkdir(path.join(workDir, '.git'), { recursive: true });
    await fs.mkdir(path.join(workDir, '.ghst'), { recursive: true });
    await fs.writeFile(
      path.join(workDir, '.ghst', 'config.json'),
      '{"site":"existing","defaults":{"format":"json"}}',
      'utf8',
    );

    const nestedDir = path.join(workDir, 'packages', 'cli');
    await fs.mkdir(nestedDir, { recursive: true });

    const previousCwd = process.cwd();
    process.chdir(nestedDir);
    try {
      await expect(run(['node', 'ghst', 'auth', 'link', '--yes'])).resolves.toBe(ExitCode.SUCCESS);
    } finally {
      process.chdir(previousCwd);
    }

    await expect(
      fs.readFile(path.join(workDir, '.ghst', 'config.json'), 'utf8'),
    ).resolves.toContain('"site": "myblog"');
    await expect(
      fs.readFile(path.join(workDir, '.ghst', 'config.json'), 'utf8'),
    ).resolves.toContain('"format": "json"');
    await expect(fs.stat(path.join(nestedDir, '.ghst', 'config.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('renders configured domains instead of internal aliases in auth status and list output', async () => {
    const logSpy = vi.mocked(console.log);

    await fs.writeFile(
      path.join(configDir, 'config.json'),
      `${JSON.stringify(
        {
          version: 2,
          active: 'team-alpha',
          sites: {
            'team-alpha': {
              url: 'https://newsroom.example.com',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
            'editorial-prod': {
              url: 'https://members.example.org',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await fs.mkdir(path.join(workDir, '.ghst'), { recursive: true });
    await fs.writeFile(
      path.join(workDir, '.ghst', 'config.json'),
      `${JSON.stringify({ site: 'editorial-prod' }, null, 2)}\n`,
      'utf8',
    );

    let start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);
    const statusOutput = logSpy.mock.calls
      .slice(start)
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(statusOutput).toContain('Active site: newsroom.example.com');
    expect(statusOutput).toContain('* newsroom.example.com');
    expect(statusOutput).toContain('  members.example.org');
    expect(statusOutput).not.toContain('team-alpha');
    expect(statusOutput).not.toContain('editorial-prod');

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'status', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    const statusJson = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '')) as {
      active: string | null;
      sites: string[];
    };
    expect(statusJson).toEqual({
      active: 'team-alpha',
      sites: ['team-alpha', 'editorial-prod'],
    });
    expect(logSpy.mock.calls.length).toBe(start + 1);

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    const listOutput = logSpy.mock.calls
      .slice(start)
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(listOutput).toContain('Active site: newsroom.example.com');
    expect(listOutput).toContain(
      'Project link: members.example.org (overrides active site in this directory)',
    );
    expect(listOutput).toContain('  newsroom.example.com');
    expect(listOutput).toContain('* members.example.org');
    expect(listOutput).not.toContain('team-alpha');
    expect(listOutput).not.toContain('editorial-prod');

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    const listJson = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '')) as {
      active: string | null;
      projectLink?: string;
      effectiveSite: string | null;
      sites: string[];
    };
    expect(listJson).toEqual({
      active: 'team-alpha',
      projectLink: 'editorial-prod',
      effectiveSite: 'editorial-prod',
      sites: ['team-alpha', 'editorial-prod'],
    });
    expect(logSpy.mock.calls.length).toBe(start + 1);
  });

  test('interactive auth switch shows bare domains and accepts a displayed domain', async () => {
    const logSpy = vi.mocked(console.log);

    await fs.writeFile(
      path.join(configDir, 'config.json'),
      `${JSON.stringify(
        {
          version: 2,
          active: 'team-alpha',
          sites: {
            'team-alpha': {
              url: 'https://newsroom.example.com',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
            'editorial-prod': {
              url: 'https://members.example.org',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setPromptForTests(async () => 'members.example.org');

    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.SUCCESS);

    if (ttyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
    }

    const switchOutput = logSpy.mock.calls
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(switchOutput).toContain('Configured sites:');
    expect(switchOutput).toContain('* newsroom.example.com');
    expect(switchOutput).toContain('  members.example.org');
    expect(switchOutput).toContain("Active site set to 'members.example.org'.");
    expect(switchOutput).not.toContain('https://');
    expect(switchOutput).not.toContain('team-alpha');
    expect(switchOutput).not.toContain('editorial-prod');

    const config = JSON.parse(await fs.readFile(path.join(configDir, 'config.json'), 'utf8')) as {
      active: string;
    };
    expect(config.active).toBe('editorial-prod');
  });

  test('interactive auth switch shows aliases only for duplicate domains', async () => {
    const logSpy = vi.mocked(console.log);

    await fs.writeFile(
      path.join(configDir, 'config.json'),
      `${JSON.stringify(
        {
          version: 2,
          active: 'primary',
          sites: {
            primary: {
              url: 'https://same.example.com',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
            secondary: {
              url: 'https://same.example.com',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
            unique: {
              url: 'https://unique.example.org',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setPromptForTests(async () => 'same.example.com [secondary]');

    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.SUCCESS);

    if (ttyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
    }

    const switchOutput = logSpy.mock.calls
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(switchOutput).toContain('* same.example.com [primary]');
    expect(switchOutput).toContain('  same.example.com [secondary]');
    expect(switchOutput).toContain('  unique.example.org');
    expect(switchOutput).toContain("Active site set to 'same.example.com [secondary]'.");
    expect(switchOutput).not.toContain('unique.example.org [unique]');

    const config = JSON.parse(await fs.readFile(path.join(configDir, 'config.json'), 'utf8')) as {
      active: string;
    };
    expect(config.active).toBe('secondary');
  });

  test('continues interactive auth when browser auto-open fails', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    setOpenUrlForTests(async () => {
      throw new Error('simulated open failure');
    });

    const promptAnswers = ['https://prompted.ghost.io', '', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');

    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);
    expect(String(errorSpy.mock.calls[0]?.[0] ?? '')).toContain(
      'could not open browser automatically',
    );
  });

  test('normalizes bare-domain URL during interactive auth login', async () => {
    const openedUrls: string[] = [];
    setOpenUrlForTests(async (url) => {
      openedUrls.push(url);
    });

    const promptAnswers = ['ghst.ghost.io', '', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');

    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);
    expect(openedUrls).toEqual(['https://ghst.ghost.io/ghost/#/settings/staff']);

    const configPath = path.join(configDir, 'config.json');
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw) as { sites: Record<string, { url: string }> };
    expect(config.sites.ghst?.url).toBe('https://ghst.ghost.io');
  });

  test('resolves redirected admin origin and stores resolved base URL', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      createGhostFixtureFetchHandler({
        postConflictOnce: true,
        onRequest: async ({ pathname, method }) => {
          if (pathname === '/ghost' && method === 'GET') {
            return new Response(null, {
              status: 302,
              headers: {
                location: 'https://john.ghost.io/ghost/',
              },
            });
          }
          return undefined;
        },
      }),
    );

    const openedUrls: string[] = [];
    setOpenUrlForTests(async (url) => {
      openedUrls.push(url);
    });

    const promptAnswers = ['john.onolan.org', 'yes', '', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');

    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);
    expect(openedUrls).toEqual(['https://john.ghost.io/ghost/#/settings/staff']);

    const configPath = path.join(configDir, 'config.json');
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw) as { sites: Record<string, { url: string }> };
    expect(config.sites.john?.url).toBe('https://john.ghost.io');
  });

  test('cancels interactive auth when redirected admin origin is not confirmed', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      createGhostFixtureFetchHandler({
        postConflictOnce: true,
        onRequest: async ({ pathname, method }) => {
          if (pathname === '/ghost' && method === 'GET') {
            return new Response(null, {
              status: 302,
              headers: {
                location: 'https://john.ghost.io/ghost/',
              },
            });
          }
          return undefined;
        },
      }),
    );

    const openedUrls: string[] = [];
    setOpenUrlForTests(async (url) => {
      openedUrls.push(url);
    });

    const promptAnswers = ['john.onolan.org', 'no'];
    setPromptForTests(async () => promptAnswers.shift() ?? '');

    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(
      ExitCode.OPERATION_CANCELLED,
    );
    expect(openedUrls).toEqual([]);
  });

  test('continues auth when admin discovery redirects within the same origin', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      createGhostFixtureFetchHandler({
        postConflictOnce: true,
        onRequest: async ({ pathname, method }) => {
          if (pathname === '/ghost' && method === 'GET') {
            return new Response(null, {
              status: 302,
              headers: {
                location: 'https://myblog.ghost.io/ghost/',
              },
            });
          }
          return undefined;
        },
      }),
    );

    const openedUrls: string[] = [];
    setOpenUrlForTests(async (url) => {
      openedUrls.push(url);
    });

    const promptAnswers = ['https://myblog.ghost.io', '', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');

    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);
    expect(openedUrls).toEqual(['https://myblog.ghost.io/ghost/#/settings/staff']);
  });

  test('prints updated staff access token guidance copy', async () => {
    const logSpy = vi.spyOn(console, 'log');
    setOpenUrlForTests(async () => undefined);

    const promptAnswers = ['https://prompted.ghost.io', '', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');

    await expect(run(['node', 'ghst', '--no-color', 'auth', 'login'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    const output = logSpy.mock.calls
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(output).toContain(
      'Copy the staff access token from your profile, then return here to continue.',
    );
    expect(output).not.toContain('staff user token');
  });

  test('fails login when ghost admin origin resolution request fails', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      createGhostFixtureFetchHandler({
        postConflictOnce: true,
        onRequest: async ({ pathname, method }) => {
          if (pathname === '/ghost' && method === 'GET') {
            throw new Error('network down');
          }
          return undefined;
        },
      }),
    );

    const errorSpy = vi.spyOn(console, 'error');
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
      ]),
    ).resolves.toBe(ExitCode.GENERAL_ERROR);

    const errorOutput = errorSpy.mock.calls
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(errorOutput).toContain('Unable to reach Ghost Admin URL');
  });

  test('fails non-interactive auth when admin discovery resolves to a different origin', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    vi.mocked(globalThis.fetch).mockImplementation(
      createGhostFixtureFetchHandler({
        postConflictOnce: true,
        onRequest: async ({ pathname, method }) => {
          if (pathname === '/ghost' && method === 'GET') {
            return new Response(null, {
              status: 302,
              headers: {
                location: 'https://john.ghost.io/ghost/',
              },
            });
          }
          return undefined;
        },
      }),
    );

    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://john.onolan.org',
        '--staff-token',
        KEY,
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);

    const errorOutput = errorSpy.mock.calls
      .map((call) => call.map((entry) => String(entry)).join(' '))
      .join('\n');
    expect(errorOutput).toContain("resolved to 'https://john.ghost.io'");
    expect(errorOutput).toContain('Re-run with --url https://john.ghost.io.');
  });

  test('keeps auth and config smoke paths focused on observable state', async () => {
    const logSpy = vi.mocked(console.log);

    await loginMyblog();

    let start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain('Active site: myblog.ghost.io');

    await expect(run(['node', 'ghst', 'config', 'set', 'defaults.limit', '25'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    const config = JSON.parse(await fs.readFile(path.join(configDir, 'config.json'), 'utf8')) as {
      active?: string;
      defaults?: { limit?: number };
    };
    expect(config.active).toBe('myblog');
    expect(config.defaults?.limit).toBe(25);

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'config', 'path'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain(path.join(configDir, 'config.json'));

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'config', 'show'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain('"credentialRef": "site:myblog"');
    expect(logOutputSince(start)).not.toContain(KEY);

    await expect(run(['node', 'ghst', 'config', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    expect(
      lastLogJson<{ active: string; defaults: { limit: number }; sites: string[] }>(),
    ).toMatchObject({
      active: 'myblog',
      defaults: { limit: 25 },
      sites: ['myblog'],
    });

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'config', 'get', 'defaults.limit'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(logOutputSince(start)).toContain('25');
  });

  test('keeps a small content-resource smoke path with real payload assertions', async () => {
    await seedSmokeFixtures();
    await loginMyblog();

    await expect(run(['node', 'ghst', 'post', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'list', '--limit', 'all'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'post', 'list', '--json', '--jq', '.posts[].title']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'post', 'get', '--slug', fixtureIds.postSlug, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ posts: Array<{ title: string }> }>().posts[0]?.title).toBe(
      fixturePrimaryPostTitle,
    );

    await expect(
      run([
        'node',
        'ghst',
        'post',
        'create',
        '--title',
        'Created',
        '--markdown-file',
        './post.md',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'create',
        '--title',
        'Created',
        '--markdown-file',
        './post.md',
        '--meta-title',
        'Meta',
        '--meta-description',
        'Meta description',
        '--og-title',
        'OG',
        '--og-image',
        'https://example.com/image.jpg',
        '--code-injection-head',
        '<style>body{}</style>',
        '--excerpt',
        'Excerpt',
        '--from-json',
        './post-from.json',
        '--tags',
        'One,Two',
        '--authors',
        'a@example.com',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'update',
        fixtureIds.postId,
        '--title',
        'Updated',
        '--featured',
        'true',
        '--from-json',
        './post-from.json',
        '--meta-title',
        'Updated Meta',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'publish',
        fixtureIds.postId,
        '--newsletter',
        'weekly',
        '--email-only',
        '--email-segment',
        'status:paid',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'schedule',
        fixtureIds.postId,
        '--at',
        '2026-03-01T10:00:00Z',
        '--newsletter',
        'weekly',
        '--email-only',
        '--email-segment',
        'status:paid',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'unschedule', fixtureIds.postId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'post', 'copy', fixtureIds.postId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'create',
        '--title',
        'Raw',
        '--html-raw-file',
        './post-raw.html',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'bulk',
        '--filter',
        'status:draft',
        '--action',
        'update',
        '--status',
        'published',
        '--authors',
        'author@example.com',
        '--add-tag',
        'extra',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'bulk',
        '--filter',
        'status:draft',
        '--action',
        'delete',
        '--yes',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'post', 'delete', '--filter', 'status:draft', '--yes', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);

    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    setPromptHandlerForTests(async () => 'no');
    await expect(run(['node', 'ghst', 'post', 'delete', fixtureIds.postId])).resolves.toBe(
      ExitCode.OPERATION_CANCELLED,
    );
    setPromptHandlerForTests(async () => 'yes');
    await expect(run(['node', 'ghst', 'post', 'delete', fixtureIds.postId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }
    if (stdoutTty) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
    }

    await expect(run(['node', 'ghst', 'page', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'page', 'get', '--slug', fixtureIds.pageSlug, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ pages: Array<{ title: string }> }>().pages[0]?.title).toBe('Fixture Page');
    await expect(
      run([
        'node',
        'ghst',
        'page',
        'create',
        '--title',
        'Contact',
        '--html',
        '<p>Hi</p>',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'page', 'update', fixtureIds.pageId, '--title', 'Updated Page']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'page', 'delete', fixtureIds.pageId, '--yes'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'page', 'copy', fixtureIds.pageId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run([
        'node',
        'ghst',
        'page',
        'bulk',
        '--filter',
        'status:draft',
        '--action',
        'update',
        '--status',
        'published',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'page',
        'bulk',
        '--filter',
        'status:draft',
        '--action',
        'delete',
        '--yes',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'tag', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'tag', 'get', '--slug', fixtureIds.tagSlug, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ tags: Array<{ name: string }> }>().tags[0]?.name).toBe('Fixture Tag');
    await expect(
      run([
        'node',
        'ghst',
        'tag',
        'create',
        '--name',
        'My Tag',
        '--accent-color',
        '#ffffff',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'tag', 'update', fixtureIds.tagId, '--name', 'Updated Tag']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'tag', 'delete', fixtureIds.tagId, '--yes'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run([
        'node',
        'ghst',
        'tag',
        'bulk',
        '--filter',
        'visibility:public',
        '--action',
        'update',
        '--visibility',
        'internal',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'tag',
        'bulk',
        '--filter',
        'visibility:public',
        '--action',
        'delete',
        '--yes',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'member', 'list', '--status', 'paid'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'member', 'list', '--status', 'gift'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'member', 'get', fixtureIds.memberId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'member', 'get', '--email', fixtureIds.memberEmail]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'member',
        'create',
        '--email',
        'newmember@example.com',
        '--name',
        'New Member',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'update', fixtureIds.memberId, '--name', 'Updated Member']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'member',
        'update',
        fixtureIds.memberId,
        '--comp',
        '--tier',
        fixtureIds.tierId,
        '--expiry',
        '2027-01-01T00:00:00Z',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'unsubscribe', '--all']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'delete', '--all', '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--update', '--all', '--labels', 'VIP,Premium']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--delete', '--all', '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'import', './members.csv', '--labels', 'Imported']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'export', '--output', './members-export.csv']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'delete', fixtureIds.memberId, '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(fs.readFile(path.join(workDir, 'members-export.csv'), 'utf8')).resolves.toContain(
      'email',
    );

    await expect(run(['node', 'ghst', 'newsletter', 'list', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(lastLogJson<{ newsletters: Array<{ id: string }> }>().newsletters[0]?.id).toMatch(/\S+/);
    await expect(
      run(['node', 'ghst', 'newsletter', 'get', fixtureIds.newsletterId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ newsletters: Array<{ id: string }> }>().newsletters[0]?.id).toBe(
      fixtureIds.newsletterId,
    );
    await expect(run(['node', 'ghst', 'newsletter', 'create', '--name', 'Weekly'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run([
        'node',
        'ghst',
        'newsletter',
        'update',
        fixtureIds.newsletterId,
        '--name',
        'Updated Weekly',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'newsletter',
        'bulk',
        '--filter',
        'status:active',
        '--action',
        'update',
        '--status',
        'archived',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'tier', 'list', '--include', 'benefits'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'tier', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ tiers: Array<{ id: string }> }>().tiers[0]?.id).toMatch(/\S+/);
    await expect(run(['node', 'ghst', 'tier', 'get', fixtureIds.tierId, '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(lastLogJson<{ tiers: Array<{ id: string }> }>().tiers[0]?.id).toBe(fixtureIds.tierId);
    await expect(
      run(['node', 'ghst', 'tier', 'create', '--name', 'Premium', '--monthly-price', '500']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'tier', 'update', fixtureIds.tierId, '--name', 'Premium Updated']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'tier',
        'bulk',
        '--filter',
        'type:paid',
        '--action',
        'update',
        '--active',
        'true',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'offer', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ offers: Array<{ id: string }> }>().offers[0]?.id).toMatch(/\S+/);
    await expect(run(['node', 'ghst', 'offer', 'get', fixtureIds.offerId, '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(lastLogJson<{ offers: Array<{ id: string }> }>().offers[0]?.id).toBe(fixtureIds.offerId);
    await expect(
      run(['node', 'ghst', 'offer', 'create', '--name', 'Sale', '--code', 'sale']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'offer', 'update', fixtureIds.offerId, '--name', 'Sale Updated']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'offer',
        'bulk',
        '--filter',
        'status:active',
        '--action',
        'update',
        '--status',
        'archived',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'label', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ labels: Array<{ id: string }> }>().labels[0]?.id).toMatch(/\S+/);
    await expect(
      run(['node', 'ghst', 'label', 'get', '--slug', fixtureIds.labelSlug, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ labels: Array<{ id: string }> }>().labels[0]?.id).toBe(fixtureIds.labelId);
    await expect(run(['node', 'ghst', 'label', 'create', '--name', 'VIP'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'label', 'update', fixtureIds.labelId, '--name', 'VIP Updated']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'label', 'delete', fixtureIds.labelId, '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'label',
        'bulk',
        '--filter',
        "name:~'VIP'",
        '--action',
        'update',
        '--name',
        'VIP Updated',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'label',
        'bulk',
        '--filter',
        "name:~'VIP'",
        '--action',
        'delete',
        '--yes',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
  });

  test('keeps site, setting, user, and image flows wired with output-aware checks', async () => {
    const logSpy = vi.mocked(console.log);
    const fixtureSite = ghostFixtures.api.admin.site.site as { title: string; url: string };
    await seedSmokeFixtures();
    await loginMyblog();

    await expect(run(['node', 'ghst', 'site', 'info', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ site: { title: string; url: string } }>().site).toMatchObject({
      title: fixtureSite.title,
      url: fixtureSite.url,
    });

    let start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'site', 'info'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain(fixtureSite.title);

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'setting', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain('title');

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'setting', 'get', 'title'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain(fixtureSite.title);

    await expect(
      run(['node', 'ghst', 'setting', 'set', 'title', 'Updated Blog', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(
      lastLogJson<{ settings: Array<{ key: string; value: string }> }>().settings[0],
    ).toMatchObject({
      key: 'title',
      value: 'Updated Blog',
    });

    start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'user', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain(fixtureIds.userEmail);

    await expect(run(['node', 'ghst', 'user', 'get', fixtureIds.userId, '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(lastLogJson<{ users: Array<{ id: string }> }>().users[0]?.id).toBe(fixtureIds.userId);

    await expect(
      run(['node', 'ghst', 'user', 'get', '--slug', fixtureIds.userSlug, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ users: Array<{ slug: string }> }>().users[0]?.slug).toBe(
      fixtureIds.userSlug,
    );

    await expect(
      run(['node', 'ghst', 'user', 'get', '--email', fixtureIds.userEmail, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ users: Array<{ email: string }> }>().users[0]?.email).toBe(
      fixtureIds.userEmail,
    );

    await expect(run(['node', 'ghst', 'user', 'me', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ users: Array<{ id: string }> }>().users[0]?.id).toBe(fixtureIds.userId);

    await expect(run(['node', 'ghst', 'image', 'upload', './photo.jpg', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(JSON.stringify(lastLogJson<{ images?: Array<Record<string, unknown>> }>())).toContain(
      '/content/images/',
    );
  });

  test('keeps comment moderation flows wired against fixture-backed admin routes', async () => {
    const logSpy = vi.mocked(console.log);
    await loginMyblog();

    await expect(run(['node', 'ghst', 'comment', 'list', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(
      lastLogJson<{ comments: Array<{ id: string }> }>().comments.some(
        (comment) => comment.id === fixtureIds.commentId,
      ),
    ).toBe(true);

    await expect(
      run(['node', 'ghst', 'comment', 'list', '--top-level-only', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    const topLevelComments = lastLogJson<{ comments: Array<{ id: string }> }>().comments;
    expect(topLevelComments.some((comment) => comment.id === fixtureIds.commentId)).toBe(true);
    expect(topLevelComments.some((comment) => comment.id === fixtureIds.commentReplyId)).toBe(
      false,
    );

    await expect(
      run(['node', 'ghst', 'comment', 'get', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comments: Array<{ id: string }> }>().comments[0]?.id).toBe(
      fixtureIds.commentId,
    );
    expect(
      lastLogJson<{ comments: Array<{ post?: { id?: string } }> }>().comments[0]?.post?.id,
    ).toBe(fixtureIds.postId);

    await expect(
      run(['node', 'ghst', 'comment', 'thread', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(
      lastLogJson<{ comment?: { id?: string }; comments: Array<{ id: string }> }>().comment?.id,
    ).toBe(fixtureIds.commentId);
    expect(lastLogJson<{ comments: Array<{ id: string }> }>().comments[0]?.id).toBe(
      fixtureIds.commentReplyId,
    );

    await expect(
      run(['node', 'ghst', 'comment', 'replies', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comments: Array<{ id: string }> }>().comments[0]?.id).toBe(
      fixtureIds.commentReplyId,
    );

    await expect(
      run(['node', 'ghst', 'comment', 'likes', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comment_likes: Array<{ id: string }> }>().comment_likes[0]?.id).toBe(
      fixtureIds.commentLikeId,
    );

    await expect(
      run(['node', 'ghst', 'comment', 'reports', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comment_reports: Array<{ id: string }> }>().comment_reports[0]?.id).toBe(
      fixtureIds.commentReportId,
    );

    await expect(
      run(['node', 'ghst', 'comment', 'hide', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comments: Array<{ status: string }> }>().comments[0]?.status).toBe(
      'hidden',
    );

    await expect(
      run(['node', 'ghst', 'comment', 'show', fixtureIds.commentId, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comments: Array<{ status: string }> }>().comments[0]?.status).toBe(
      'published',
    );

    await expect(
      run(['node', 'ghst', 'comment', 'delete', fixtureIds.commentId, '--yes', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ comments: Array<{ status: string }> }>().comments[0]?.status).toBe(
      'deleted',
    );

    const start = logSpy.mock.calls.length;
    await expect(run(['node', 'ghst', 'comment', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    expect(logOutputSince(start)).toContain(fixtureIds.commentId);
  });

  test('keeps theme, webhook, and mcp smoke paths behind explicit test runners', async () => {
    const logSpy = vi.mocked(console.log);
    await seedSmokeFixtures();
    await loginMyblog();

    const stdioRunner = vi.fn(async () => undefined);
    const httpRunner = vi.fn(async () => undefined);
    setMcpRunnersForTests({
      stdio: stdioRunner,
      http: httpRunner,
    });

    const webhookRunner = vi.fn(async (_global, listenOptions) => {
      listenOptions.onEvent?.({ type: 'ready', forwardTo: listenOptions.forwardTo });
    });
    setWebhookListenRunnerForTests(webhookRunner);

    const themeRunner = vi.fn(async (_global, devOptions) => {
      devOptions.onEvent?.({ type: 'uploaded', source: 'initial' });
      return { themes: [{ name: 'uploaded-theme', active: true }] };
    });
    setThemeDevRunnerForTests(themeRunner);
    setThemeValidatorForTests(async () => ({ results: { errors: [] } }));

    await expect(run(['node', 'ghst', 'theme', 'list'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'theme', 'upload', './theme.zip', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(lastLogJson<{ themes: Array<{ name: string }> }>().themes[0]?.name).toBe(
      'uploaded-theme',
    );
    await expect(
      run(['node', 'ghst', 'theme', 'upload', './theme.zip', '--activate', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(
      lastLogJson<{ themes: Array<{ name: string; active: boolean }> }>().themes[0],
    ).toMatchObject({
      name: 'uploaded-theme',
      active: true,
    });
    await expect(run(['node', 'ghst', 'theme', 'activate', fixtureIds.themeName])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'theme', 'validate', './theme.zip'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    expect(logOutputSince(logSpy.mock.calls.length - 1)).toContain('Theme validation completed');

    await expect(
      run(['node', 'ghst', 'theme', 'dev', './theme-dev', '--watch', '--activate']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(themeRunner).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ path: './theme-dev', watch: true, activate: true }),
    );

    await expect(
      run([
        'node',
        'ghst',
        'webhook',
        'create',
        '--event',
        'post.published',
        '--target-url',
        'https://example.com/hook',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'webhook', 'events'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'webhook',
        'update',
        fixtureIds.webhookId,
        '--target-url',
        'https://example.com/new-hook',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'webhook', 'delete', fixtureIds.webhookId, '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'webhook',
        'listen',
        '--public-url',
        'https://hooks.example.com/ghost',
        '--forward-to',
        'http://localhost:3000/webhooks',
        '--events',
        'post.published,member.added',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'webhook',
        'listen',
        '--public-url',
        'https://hooks.example.com/ghost',
        '--forward-to',
        'http://localhost:3000/webhooks',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(webhookRunner).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        publicUrl: 'https://hooks.example.com/ghost',
        forwardTo: 'http://localhost:3000/webhooks',
      }),
    );

    await expect(run(['node', 'ghst', 'mcp', 'stdio'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'mcp', 'stdio', '--tools', 'posts,tags'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'mcp', 'stdio', '--tools', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'mcp', 'stdio', '--tools', ','])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(
      run(['node', 'ghst', 'mcp', 'http', '--port', '3100', '--tools', 'posts,tags']),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'mcp',
        'http',
        '--port',
        '3100',
        '--tools',
        'posts',
        '--auth-token',
        'token-123',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'mcp',
        'http',
        '--host',
        '0.0.0.0',
        '--port',
        '3100',
        '--tools',
        'posts,tags',
        '--auth-token',
        'token-123',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'mcp',
        'http',
        '--host',
        '0.0.0.0',
        '--port',
        '3100',
        '--tools',
        'posts,tags',
        '--auth-token',
        'token-123',
        '--unsafe-public-bind',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'mcp',
        'http',
        '--port',
        '3100',
        '--tools',
        'posts,tags',
        '--auth-token',
        'token-123',
        '--cors-origin',
        '*',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'mcp',
        'http',
        '--port',
        '3100',
        '--tools',
        ',',
        '--auth-token',
        'token-123',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    expect(stdioRunner).toHaveBeenCalledTimes(2);
    expect(httpRunner).toHaveBeenCalledTimes(2);
  });

  test('keeps stats, api, migrate, and completion smoke paths tied to file or json outputs', async () => {
    await seedSmokeFixtures();
    await loginMyblog();

    await expect(run(['node', 'ghst', 'api'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'api', '/site/'])).resolves.toBe(ExitCode.SUCCESS);
    const fixtureSite = ghostFixtures.api.admin.site.site as { title: string };
    expect(lastLogJson<{ site: { title: string } }>().site.title).toBe(fixtureSite.title);
    await expect(
      run(['node', 'ghst', 'api', '/ghost/api/admin/site/', '--method', 'GET']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/settings/', '--query', 'limit=1', 'status=published']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--method', 'POST', '--input', './payload.json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--content-api', '--method', 'GET']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'api',
        '/posts/',
        '--method',
        'POST',
        '--body',
        '{"title":"Inline"}',
        '--field',
        'status=draft',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--paginate', '--include-headers']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'api', '/site/', '--paginate'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--method', 'POST', '--field', 'status=draft']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--body', '{}', '--input', './payload.json']),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(
      run(['node', 'ghst', 'api', '../../../members/', '--method', 'GET']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'api', '/%2E%2E%2Fmembers/', '--method', 'GET']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run(['node', 'ghst', 'stats', 'posts', '--csv', '--output', './posts.csv']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(fs.readFile(path.join(workDir, 'posts.csv'), 'utf8')).resolves.toContain(
      'post_id,title',
    );

    await expect(
      run(['node', 'ghst', 'migrate', 'csv', '--file', './migrate.csv', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ imported?: number }>().imported).toBe(1);
    await expect(run(['node', 'ghst', 'migrate', 'json', '--file', './import.json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    await expect(
      run(['node', 'ghst', 'migrate', 'export', '--output', './export.zip', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(lastLogJson<{ ok: boolean; output: string }>().output).toBe('./export.zip');
    await expect(fs.stat(path.join(workDir, 'export.zip'))).resolves.toBeTruthy();

    await expect(run(['node', 'ghst', 'completion'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion', 'bash'])).resolves.toBe(ExitCode.SUCCESS);
    expect(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? '')).toContain('--debug');
    await expect(run(['node', 'ghst', 'completion', 'zsh'])).resolves.toBe(ExitCode.SUCCESS);
    expect(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? '')).toContain('#compdef ghst');
    await expect(run(['node', 'ghst', 'completion', 'fish'])).resolves.toBe(ExitCode.SUCCESS);
    expect(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? '')).toContain(
      'complete -c ghst',
    );
    await expect(run(['node', 'ghst', 'completion', 'powershell'])).resolves.toBe(ExitCode.SUCCESS);
    expect(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? '')).toContain(
      'Register-ArgumentCompleter',
    );
    await expect(run(['node', 'ghst', 'completion', 'bad-shell'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
  });

  test('post schedule forwards email delivery flags as query params', async () => {
    const putRequests: Array<{ url: URL; body: Record<string, unknown> }> = [];

    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method, url, init }) => {
        if (method === 'PUT' && pathname.endsWith(`/ghost/api/admin/posts/${fixtureIds.postId}/`)) {
          putRequests.push({
            url: new URL(url.toString()),
            body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
          });
        }

        return undefined;
      },
    });

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'post',
        'schedule',
        fixtureIds.postId,
        '--at',
        '2026-03-01T10:00:00Z',
        '--newsletter',
        'weekly',
        '--email-only',
        '--email-segment',
        'status:paid',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(putRequests).toHaveLength(1);
    expect(putRequests[0]?.url.searchParams.get('newsletter')).toBe('weekly');
    expect(putRequests[0]?.url.searchParams.get('email_only')).toBe('true');
    expect(putRequests[0]?.url.searchParams.get('email_segment')).toBe('status:paid');
    expect(putRequests[0]?.body).toMatchObject({
      posts: [
        {
          status: 'scheduled',
          published_at: '2026-03-01T10:00:00Z',
          updated_at: expect.any(String),
        },
      ],
    });
    expect(JSON.stringify(putRequests[0]?.body ?? {})).not.toContain('"newsletter"');
    expect(JSON.stringify(putRequests[0]?.body ?? {})).not.toContain('"email_only"');
    expect(JSON.stringify(putRequests[0]?.body ?? {})).not.toContain('"email_segment"');
  });

  test('uses env output mode for json errors', async () => {
    process.env.GHST_OUTPUT = 'json';
    await expect(run(['node', 'ghst', 'api'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('uses env output mode for stats json responses', async () => {
    process.env.GHST_OUTPUT = 'json';
    const logSpy = vi.spyOn(console, 'log');

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'overview',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toContain('"summary"');
  });

  test('validates phase 2 resource commands across non-interactive and error branches', async () => {
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        '--site',
        'myblog',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'member', 'get'])).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'add-label', '--all']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'delete', '--all', '--filter', 'id:1']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'newsletter', 'update', fixtureIds.newsletterId]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'newsletter',
        'bulk',
        '--filter',
        'status:active',
        '--action',
        'update',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', 'tier', 'update', fixtureIds.tierId])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(
      run(['node', 'ghst', 'tier', 'bulk', '--filter', 'type:paid', '--action', 'update']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', 'offer', 'update', fixtureIds.offerId])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(
      run(['node', 'ghst', 'offer', 'bulk', '--filter', 'status:active', '--action', 'update']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', 'label', 'get'])).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'label', 'get', fixtureIds.labelId, '--slug', fixtureIds.labelSlug]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'post', 'bulk', '--filter', 'status:draft', '--action', 'delete']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'page', 'bulk', '--filter', 'status:draft', '--action', 'update']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'tag', 'bulk', '--filter', 'visibility:public', '--action', 'update']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'label', 'bulk', '--filter', "name:~'vip'", '--action', 'update']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'label', 'bulk', '--filter', "name:~'vip'", '--action', 'delete']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        'member',
        'update',
        fixtureIds.memberId,
        '--expiry',
        '2027-01-01T00:00:00Z',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', 'member', 'bulk', '--update', '--all'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'member', 'bulk', '--delete', '--all'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'delete', '--all']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'member', 'delete', fixtureIds.memberId])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }

    await expect(run(['node', 'ghst', 'member', 'export', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
  });

  test('normalizes mcp http cors origin before invoking the runner', async () => {
    let seenOptions:
      | {
          host: string;
          port: number;
          corsOrigin?: string;
          authToken: string;
          maxBodyBytes: number;
          headersTimeoutMs: number;
          requestTimeoutMs: number;
          keepAliveTimeoutMs: number;
        }
      | undefined;

    setMcpRunnersForTests({
      http: async (_server, options) => {
        seenOptions = options;
      },
    });

    await expect(
      run([
        'node',
        'ghst',
        'mcp',
        'http',
        '--port',
        '3100',
        '--tools',
        'posts',
        '--auth-token',
        'token-123',
        '--cors-origin',
        'https://app.example.com/',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(seenOptions?.corsOrigin).toBe('https://app.example.com');
  });

  test('validates phase 3 commands across permission, validation, and migrate edge cases', async () => {
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        '--site',
        'myblog',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await fs.writeFile(path.join(workDir, 'wp.xml'), '<rss></rss>', 'utf8');
    await fs.writeFile(path.join(workDir, 'medium.zip'), 'fake-medium', 'utf8');
    await fs.writeFile(path.join(workDir, 'substack.zip'), 'fake-substack', 'utf8');
    await fs.writeFile(path.join(workDir, 'theme.zip'), 'fake-theme', 'utf8');
    await fs.writeFile(path.join(workDir, 'import.json'), '{"db":[{"meta":{},"data":{}}]}', 'utf8');
    await fs.writeFile(path.join(workDir, 'bad.csv'), 'title,body\nNope,Nope\n', 'utf8');

    await expect(run(['node', 'ghst', 'webhook', 'update', fixtureIds.webhookId])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(
      run([
        'node',
        'ghst',
        'webhook',
        'listen',
        '--public-url',
        'https://hooks.example.com/ghost',
        '--forward-to',
        'http://localhost:3000/webhooks',
        '--events',
        'post.invalid',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'webhook', 'delete', fixtureIds.webhookId])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    setPromptHandlerForTests(async () => 'no');
    await expect(run(['node', 'ghst', 'webhook', 'delete', fixtureIds.webhookId])).resolves.toBe(
      ExitCode.OPERATION_CANCELLED,
    );
    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }
    if (stdoutTty) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
    }

    await expect(run(['node', 'ghst', 'user', 'get'])).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'user', 'get', fixtureIds.userId, '--slug', 'owner']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    const themeDir = path.join(workDir, 'theme-dir');
    await fs.mkdir(themeDir, { recursive: true });
    await fs.writeFile(
      path.join(themeDir, 'package.json'),
      '{"name":"theme-dir","version":"1.0.0"}',
      'utf8',
    );
    await expect(run(['node', 'ghst', 'theme', 'upload', './theme-dir'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    await expect(
      run(['node', 'ghst', 'theme', 'upload', './theme-dir', '--zip', '--activate']),
    ).resolves.toBe(ExitCode.SUCCESS);
    setThemeValidatorForTests(async () => ({ results: { error: [] } }));
    await expect(run(['node', 'ghst', 'theme', 'validate', './theme.zip'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'theme', 'validate', './theme.zip', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    setThemeValidatorForTests(async () => ({ results: { error: [{ message: 'invalid' }] } }));
    await expect(run(['node', 'ghst', 'theme', 'validate', './theme.zip'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );

    await expect(
      run([
        'node',
        'ghst',
        'api',
        '/posts/',
        '--method',
        'POST',
        '--body',
        '[]',
        '--field',
        'status=draft',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'api', '/posts/', '--field', '=broken'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );

    await expect(run(['node', 'ghst', 'mcp', 'stdio', '--tools', 'unknown'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    setThemeValidatorForTests(async () => ({
      results: { error: { all: [{ message: 'invalid' }] } },
    }));
    await expect(run(['node', 'ghst', 'theme', 'validate', './theme.zip'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    setThemeValidatorForTests(async () => ({ error: [{ message: 'invalid' }] }));
    await expect(run(['node', 'ghst', 'theme', 'validate', './theme.zip'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    setThemeValidatorForTests(null);
    await expect(
      run(['node', 'ghst', 'theme', 'activate', fixtureIds.themeName, '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'webhook', 'events', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    await expect(run(['node', 'ghst', 'setting', 'set', 'title', 'true'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', '5'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', 'null'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', '{"a":1}'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', '{bad}'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      createGhostFixtureFetchHandler({
        onRequest: ({ pathname, method }) => {
          if (pathname.endsWith('/ghost/api/admin/settings/') && method === 'PUT') {
            return new Response(
              JSON.stringify({ errors: [{ message: 'No permission', context: 'Forbidden' }] }),
              {
                status: 403,
                headers: { 'content-type': 'application/json' },
              },
            );
          }
          return undefined;
        },
      }),
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', 'Denied'])).resolves.toBe(
      ExitCode.AUTH_ERROR,
    );
    installGhostFixtureFetchMock({ postConflictOnce: true });

    await expect(
      run(['node', 'ghst', 'migrate', 'substack', '--file', './substack.zip']),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://substack.example.com',
        'migrate',
        'substack',
        '--file',
        './substack.zip',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'migrate', 'csv', '--file', './bad.csv'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );

    setMigrateSourceLoaderForTests(async (modulePath) => {
      if (modulePath === '@tryghost/mg-wp-xml') {
        return {
          default: async () => ({
            posts: [{ url: 'wp://post/1', data: { title: 'WP', html: '<p>wp</p>' } }],
          }),
        };
      }

      if (modulePath === '@tryghost/mg-medium-export') {
        return {
          default: () => ({
            posts: [{ url: 'medium://post/1', data: { title: 'Medium', html: '<p>medium</p>' } }],
          }),
        };
      }

      if (modulePath === '@tryghost/mg-substack') {
        return {
          default: {
            ingest: async () => ({ posts: [] }),
            process: async () => ({
              posts: [
                { url: 'substack://post/1', data: { title: 'Substack', html: '<p>substack</p>' } },
              ],
            }),
          },
        };
      }

      if (modulePath === '@tryghost/mg-json') {
        return {
          toGhostJSON: async (input: Record<string, unknown>) => ({
            meta: { exported_on: 1, version: '2.0.0' },
            data: input,
          }),
        };
      }

      throw new Error(`Unexpected migrate module: ${modulePath}`);
    });
    await expect(run(['node', 'ghst', 'migrate', 'wordpress', '--file', './wp.xml'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'migrate', 'wordpress', '--file', './wp.xml', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'migrate', 'medium', '--file', './medium.zip']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'migrate', 'medium', '--file', './medium.zip', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'migrate',
        'substack',
        '--file',
        './substack.zip',
        '--url',
        'https://substack.example.com',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'migrate',
        'substack',
        '--file',
        './substack.zip',
        '--url',
        'https://substack.example.com',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'migrate', 'json', '--file', './import.json', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'migrate', 'export', '--output', './out.zip', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    setMigrateSourceLoaderForTests(null);

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      createGhostFixtureFetchHandler({
        onRequest: ({ pathname, method }) => {
          if (pathname.endsWith('/ghost/api/admin/users/me/') && method === 'GET') {
            return new Response(
              JSON.stringify({ errors: [{ message: 'Forbidden', context: 'No staff context' }] }),
              {
                status: 403,
                headers: { 'content-type': 'application/json' },
              },
            );
          }
          return undefined;
        },
      }),
    );
    await expect(run(['node', 'ghst', 'user', 'me'])).resolves.toBe(ExitCode.AUTH_ERROR);
  });

  test('renders stats summaries across json, jq, human, and csv outputs', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'overview',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toContain('"summary"');
    expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toContain('"timeseries"');

    logSpy.mockClear();
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'overview',
        '--range',
        '90d',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    const overviewOutput = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(overviewOutput).toContain('Members: 157 (+23)');
    expect(overviewOutput).toContain('Paid members: 31 (+7)');
    expect(overviewOutput).toContain('MRR: 1,540 (+360)');

    logSpy.mockClear();
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'growth',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(String(logSpy.mock.calls[0]?.[0] ?? '')).toContain('Growth');

    logSpy.mockClear();
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'email',
        'clicks',
        '--newsletter',
        fixtureIds.newsletterId,
        '--json',
        '--jq',
        '.clicks[].clicks',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining(['24']),
    );

    logSpy.mockClear();
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'posts',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toContain('"posts"');

    logSpy.mockClear();
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'post',
        fixtureIds.postId,
        'web',
        '--limit',
        '1',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    const limitedPostWeb = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '{}')) as {
      sources?: Array<{ label: string }>;
      locations?: Array<{ label: string }>;
    };
    expect(limitedPostWeb.sources).toHaveLength(1);
    expect(limitedPostWeb.sources?.[0]?.label).toBe('Twitter');
    expect(limitedPostWeb.locations).toHaveLength(1);
    expect(limitedPostWeb.locations?.[0]?.label).toBe('US');

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'web',
        'sources',
        '--csv',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(stdoutSpy.mock.calls.map((call) => String(call[0])).join('')).toContain(
      'label,visits,signups,paid_conversions,mrr',
    );

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'post',
        fixtureIds.postId,
        'referrers',
        '--csv',
        '--output',
        './post-referrers.csv',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(fs.readFile(path.join(workDir, 'post-referrers.csv'), 'utf8')).resolves.toContain(
      'source,visits,signups,paid_conversions,mrr',
    );
  });

  test('handles remaining stats views and validation failures', async () => {
    const logSpy = vi.spyOn(console, 'log');

    for (const argv of [
      ['stats', 'web'],
      ['stats', 'web', 'content'],
      ['stats', 'web', 'devices'],
      ['stats', 'web', 'utm-sources', '--json'],
      ['stats', 'email', '--csv'],
      ['stats', 'posts', '--csv'],
      ['stats', 'email', 'subscribers'],
      ['stats', 'post', fixtureIds.postId],
      ['stats', 'post', fixtureIds.postId, 'web'],
      ['stats', 'post', fixtureIds.postId, 'growth', '--csv'],
      ['stats', 'post', fixtureIds.postId, 'newsletter'],
    ]) {
      await expect(
        run(['node', 'ghst', '--url', 'https://myblog.ghost.io', '--staff-token', KEY, ...argv]),
      ).resolves.toBe(ExitCode.SUCCESS);
    }

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        `Post: ${fixturePrimaryPostTitle}`,
        `Post Newsletter: ${fixturePrimaryPostTitle}`,
      ]),
    );

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'web',
        '--csv',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'newsletters',
        'clicks',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'stats',
        'post',
        fixtureIds.postId,
        'unknown',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('runs socialweb commands through the identity-token bridge', async () => {
    const logSpy = vi.spyOn(console, 'log');
    await fs.writeFile(path.join(workDir, 'photo.jpg'), 'image');
    const stdinTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'delete',
        'https://myblog.ghost.io/.ghost/activitypub/note/1',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);
    if (stdinTtyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTtyDescriptor);
    }
    if (stdoutTtyDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutTtyDescriptor);
    }

    for (const argv of [
      ['socialweb', 'status', '--json'],
      ['socialweb', 'profile', '--json'],
      ['socialweb', 'search', 'alice', '--json'],
      ['socialweb', 'notes', '--all', '--json'],
      ['socialweb', 'reader', '--json'],
      ['socialweb', 'notifications', '--json'],
      ['socialweb', 'notifications-count', '--json'],
      ['socialweb', 'posts', '--json'],
      ['socialweb', 'likes', '--json'],
      ['socialweb', 'followers', '--limit', '1', '--json'],
      ['socialweb', 'following', '--limit', '1', '--json'],
      ['socialweb', 'post', 'https://remote.example/posts/1', '--json'],
      ['socialweb', 'thread', 'https://remote.example/posts/1', '--json'],
      ['socialweb', 'follow', '@alice@remote.example', '--json'],
      ['socialweb', 'unfollow', '@alice@remote.example', '--json'],
      ['socialweb', 'like', 'https://remote.example/posts/1', '--json'],
      ['socialweb', 'unlike', 'https://remote.example/posts/1', '--json'],
      ['socialweb', 'repost', 'https://remote.example/posts/1', '--json'],
      ['socialweb', 'derepost', 'https://remote.example/posts/1', '--json'],
      [
        'socialweb',
        'delete',
        'https://myblog.ghost.io/.ghost/activitypub/note/1',
        '--yes',
        '--json',
      ],
      ['socialweb', 'blocked-accounts', '--limit', '1', '--json'],
      ['socialweb', 'blocked-domains', '--limit', '1', '--json'],
      ['socialweb', 'block', 'https://remote.example/users/alice', '--json'],
      ['socialweb', 'unblock', 'https://remote.example/users/alice', '--json'],
      ['socialweb', 'block-domain', 'https://remote.example', '--json'],
      ['socialweb', 'unblock-domain', 'https://remote.example', '--json'],
      ['socialweb', 'upload', path.join(workDir, 'photo.jpg'), '--json'],
      ['socialweb', 'enable', '--json'],
    ] as const) {
      await expect(
        run(['node', 'ghst', '--url', 'https://myblog.ghost.io', '--staff-token', KEY, ...argv]),
      ).resolves.toBe(ExitCode.SUCCESS);
    }

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'profile-update',
        '--name',
        'Updated Owner',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining(['Name: Updated Owner']),
    );

    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, Symbol.asyncIterator);
    Object.defineProperty(process.stdin, Symbol.asyncIterator, {
      configurable: true,
      value: async function* () {
        yield Buffer.from('stdin note');
      },
    });

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'note',
        '--stdin',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    if (stdinDescriptor) {
      Object.defineProperty(process.stdin, Symbol.asyncIterator, stdinDescriptor);
    }

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'reply',
        'https://remote.example/posts/1',
        '--content',
        'reply text',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'disable',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'notes',
        '--all',
        '--next',
        'cursor',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
  });

  test('renders socialweb human output and validates invalid inputs', async () => {
    const logSpy = vi.spyOn(console, 'log');
    await fs.writeFile(path.join(workDir, 'photo.jpg'), 'image');

    for (const argv of [
      ['socialweb', 'status'],
      ['socialweb', 'profile'],
      ['socialweb', 'search', 'alice'],
      ['socialweb', 'notes'],
      ['socialweb', 'notifications'],
      ['socialweb', 'followers', '--limit', '1'],
      ['socialweb', 'thread', 'https://remote.example/posts/1'],
      ['socialweb', 'follow', '@alice@remote.example'],
      ['socialweb', 'blocked-domains', '--limit', '1'],
      ['socialweb', 'block-domain', 'https://remote.example'],
      ['socialweb', 'unblock-domain', 'https://remote.example'],
      ['socialweb', 'unfollow', '@alice@remote.example'],
      ['socialweb', 'upload', path.join(workDir, 'photo.jpg')],
      ['socialweb', 'disable'],
      ['socialweb', 'enable'],
    ] as const) {
      await expect(
        run(['node', 'ghst', '--url', 'https://myblog.ghost.io', '--staff-token', KEY, ...argv]),
      ).resolves.toBe(ExitCode.SUCCESS);
    }

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(printed).toContain('Social web: enabled');
    expect(printed).toContain('Handle: @index@myblog.ghost.io');
    expect(printed).toContain('@alice@remote.example');

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'profile',
        'alice',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'follow',
        'alice',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'profile-update',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'note',
        '--content',
        'hello',
        '--stdin',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'block-domain',
        'not-a-url',
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'upload',
        path.join(workDir, 'missing.jpg'),
      ]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
  });

  test('preserves raw mutation payloads in socialweb json mode', async () => {
    const logSpy = vi.spyOn(console, 'log');

    for (const argv of [
      ['socialweb', 'unfollow', '@alice@remote.example', '--json'],
      ['socialweb', 'unlike', 'https://remote.example/posts/1', '--json'],
      ['socialweb', 'derepost', 'https://remote.example/posts/1', '--json'],
      [
        'socialweb',
        'delete',
        'https://myblog.ghost.io/.ghost/activitypub/note/1',
        '--yes',
        '--json',
      ],
      ['socialweb', 'block', 'https://remote.example/users/alice', '--json'],
      ['socialweb', 'unblock', 'https://remote.example/users/alice', '--json'],
      ['socialweb', 'block-domain', 'https://remote.example', '--json'],
      ['socialweb', 'unblock-domain', 'https://remote.example', '--json'],
    ] as const) {
      logSpy.mockClear();
      await expect(
        run(['node', 'ghst', '--url', 'https://myblog.ghost.io', '--staff-token', KEY, ...argv]),
      ).resolves.toBe(ExitCode.SUCCESS);
      expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toBe('{}');
    }
  });

  test('warns when socialweb is enabled but backend readiness is still unavailable', async () => {
    const logSpy = vi.spyOn(console, 'log');
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/.ghost/activitypub/v1/account/me') && method === 'GET') {
          return new Response(JSON.stringify({ error: 'Social web disabled' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return undefined;
      },
    });

    await expect(
      run([
        'node',
        'ghst',
        '--url',
        'https://myblog.ghost.io',
        '--staff-token',
        KEY,
        'socialweb',
        'enable',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(printed).toContain('Reachable: no');
    expect(printed).toContain(
      'Warning: Social web is enabled, but the social web service is not reachable yet.',
    );
  });
});
