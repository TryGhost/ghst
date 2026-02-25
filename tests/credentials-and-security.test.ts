import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { run } from '../src/index.js';
import { readUserConfig } from '../src/lib/config.js';
import { setCredentialStoreForTests } from '../src/lib/credentials.js';
import { ExitCode } from '../src/lib/errors.js';
import {
  createMemoryCredentialStore,
  createUnavailableCredentialStore,
} from './helpers/mock-credentials.js';
import { installGhostFixtureFetchMock } from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

describe('credential storage and security defaults', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;
  let previousApiVersion: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;
    previousApiVersion = process.env.GHOST_API_VERSION;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-security-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    process.env.GHOST_API_VERSION = 'v6.0';

    installGhostFixtureFetchMock();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setCredentialStoreForTests(null);
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
  });

  test('stores new login credentials in secure store and config metadata only', async () => {
    const store = createMemoryCredentialStore();
    setCredentialStoreForTests(store);

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

    const raw = JSON.parse(await fs.readFile(path.join(configDir, 'config.json'), 'utf8')) as {
      sites?: Record<string, { staffAccessToken?: string; credentialRef?: string }>;
    };
    const site = raw.sites?.myblog;
    expect(site?.credentialRef).toBe('site:myblog');
    expect(site?.staffAccessToken).toBeUndefined();
    await expect(store.get('site:myblog')).resolves.toBe(KEY);

    await expect(run(['node', 'ghst', 'auth', 'token'])).resolves.toBe(ExitCode.SUCCESS);
  });

  test('requires --insecure-storage when secure store is unavailable', async () => {
    setCredentialStoreForTests(createUnavailableCredentialStore());

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
        '--staff-token',
        KEY,
        '--site',
        'myblog',
        '--insecure-storage',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    const raw = JSON.parse(await fs.readFile(path.join(configDir, 'config.json'), 'utf8')) as {
      sites?: Record<string, { staffAccessToken?: string; credentialRef?: string }>;
    };
    expect(raw.sites?.myblog?.staffAccessToken).toBe(KEY);
    expect(raw.sites?.myblog?.credentialRef).toBeUndefined();
  });

  test('migrates plaintext staff tokens into secure store on read', async () => {
    const store = createMemoryCredentialStore();
    setCredentialStoreForTests(store);

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

    const config = await readUserConfig();
    expect(config.sites.myblog?.credentialRef).toBe('site:myblog');
    expect(config.sites.myblog?.staffAccessToken).toBeUndefined();
    await expect(store.get('site:myblog')).resolves.toBe(KEY);

    const persisted = JSON.parse(
      await fs.readFile(path.join(configDir, 'config.json'), 'utf8'),
    ) as {
      sites?: Record<string, { staffAccessToken?: string; credentialRef?: string }>;
    };
    expect(persisted.sites?.myblog?.credentialRef).toBe('site:myblog');
    expect(persisted.sites?.myblog?.staffAccessToken).toBeUndefined();
  });

  test('redacts sensitive config output unless --show-secrets is used', async () => {
    setCredentialStoreForTests(createUnavailableCredentialStore());
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
        '--insecure-storage',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    logSpy.mockClear();
    errorSpy.mockClear();
    await expect(run(['node', 'ghst', 'config', 'show'])).resolves.toBe(ExitCode.SUCCESS);
    const shown = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(shown).toContain('<redacted>');
    expect(shown).not.toContain(KEY);

    logSpy.mockClear();
    await expect(
      run(['node', 'ghst', 'config', 'get', 'sites.myblog.staffAccessToken']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toBe('<redacted>');

    logSpy.mockClear();
    await expect(
      run(['node', 'ghst', 'config', 'get', 'sites.myblog.staffAccessToken', '--show-secrets']),
    ).resolves.toBe(ExitCode.SUCCESS);
    expect(String(logSpy.mock.calls.at(-1)?.[0] ?? '')).toBe(KEY);
  });
});
